use super::*;
const MAX_REPLACE_FILES: usize = 100;
const MAX_REPLACE_BYTES: usize = 20 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
pub struct Replacement {
    path: String,
    before: String,
    after: String,
    count: usize,
}
#[derive(Serialize)]
pub struct ReplacePreview {
    files: Vec<Replacement>,
    truncated: bool,
    skipped: usize,
}
#[derive(Serialize)]
pub struct ReplaceResult {
    path: String,
    error: Option<String>,
}
#[cfg(test)]
fn preview_at(
    root: &Path,
    query: &str,
    replacement: &str,
    options: &SearchOptions,
) -> Result<ReplacePreview, String> {
    preview_files(&ProjectFiles::uncached(root)?, query, replacement, options)
}
fn preview_files(
    files: &ProjectFiles,
    query: &str,
    replacement: &str,
    options: &SearchOptions,
) -> Result<ReplacePreview, String> {
    if replacement.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("검색어·대체어 길이가 올바르지 않습니다.".into());
    }
    if replacement.contains('\0') {
        return Err("대체어에 NUL 문자를 사용할 수 없습니다.".into());
    }
    let matcher = Matcher::new(query, options)?;
    let index = &files.index;
    let mut preview = ReplacePreview {
        files: vec![],
        truncated: index.truncated,
        skipped: index.skipped,
    };
    let mut bytes = 0;
    for entry in index
        .entries
        .iter()
        .filter(|entry| matcher.includes(&entry.path))
    {
        if index::is_binary_file(&entry.path) {
            preview.skipped += 1;
            continue;
        }
        let Some(before) = files.text(&entry.path) else {
            preview.skipped += 1;
            continue;
        };
        if matcher.find_iter(&before).next().is_none() {
            continue;
        }
        if preview.files.len() >= MAX_REPLACE_FILES {
            preview.truncated = true;
            break;
        }
        // Results larger than a document are skipped before they are built.
        let Some((after, count)) =
            matcher.replace(&before, replacement, MAX_DOCUMENT_BYTES as usize)
        else {
            preview.skipped += 1;
            continue;
        };
        if bytes + before.len() + after.len() > MAX_REPLACE_BYTES {
            preview.truncated = true;
            break;
        }
        if *before == after {
            continue;
        }
        bytes += before.len() + after.len();
        preview.files.push(Replacement {
            path: entry.path.clone(),
            before: before.to_string(),
            after,
            count,
        });
    }
    Ok(preview)
}
fn apply_at(root: &Path, files: Vec<Replacement>) -> Result<Vec<ReplaceResult>, String> {
    let mut bytes = 0;
    let mut paths = std::collections::HashSet::new();
    if files.len() > MAX_REPLACE_FILES {
        return Err("최대 100개 파일만 적용할 수 있습니다.".into());
    }
    for file in &files {
        bytes += file.before.len() + file.after.len();
        if bytes > MAX_REPLACE_BYTES
            || file.before.len() as u64 > MAX_DOCUMENT_BYTES
            || file.after.len() as u64 > MAX_DOCUMENT_BYTES
            || file.after.contains('\0')
            || !paths.insert(advanced::path_key(&file.path))
        {
            return Err("변경 대상·크기 제한 오류".into());
        }
    }
    let mut preflight = Vec::new();
    for file in &files {
        let check = contained_path(root, &file.path)
            .and_then(|path| read_text(&path))
            .and_then(|(text, _)| {
                if text == file.before {
                    Ok(())
                } else {
                    Err("미리보기 이후 파일이 변경되었습니다.".into())
                }
            });
        preflight.push(ReplaceResult {
            path: file.path.clone(),
            error: check.err(),
        });
    }
    if preflight.iter().any(|result| result.error.is_some()) {
        for result in &mut preflight {
            if result.error.is_none() {
                result.error = Some("다른 파일 충돌로 적용하지 않았습니다.".into());
            }
        }
        return Ok(preflight);
    }
    Ok(files
        .into_iter()
        .map(|file| {
            let write = contained_path(root, &file.path)
                .and_then(|path| write_text(&path, &file.after, &file.before));
            ReplaceResult {
                path: file.path,
                error: write.err(),
            }
        })
        .collect())
}
#[tauri::command]
pub async fn preview_replace(
    app: AppHandle,
    root: String,
    query: String,
    replacement: String,
    options: SearchOptions,
) -> Result<ReplacePreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = authorized_root(&app, &root)?;
        preview_files(
            &project_files(&app, &root, &folder)?,
            &query,
            &replacement,
            &options,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn apply_replace(
    app: AppHandle,
    root: String,
    files: Vec<Replacement>,
) -> Result<Vec<ReplaceResult>, String> {
    tauri::async_runtime::spawn_blocking(move || apply_at(&authorized_root(&app, &root)?, files))
        .await
        .map_err(|error| error.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_and_replace_share_conditions() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("docs/old")).unwrap();
        let text = "Item-1 item-22\r\nitems-3 끝\n😀 item-4";
        for path in ["docs/a.md", "docs/old/b.md", "c.txt"] {
            fs::write(root.join(path), text).unwrap();
        }
        let options = SearchOptions {
            regex: true,
            whole_word: true,
            include: "*.md".into(),
            exclude: "docs/old".into(),
            ..SearchOptions::default()
        };
        let found = advanced::search_within(&root, "", r"item-(\d+)", &options).unwrap();
        let positions: Vec<_> = found
            .matches
            .iter()
            .map(|found| (found.path.as_str(), found.line, found.column, found.length))
            .collect();
        assert_eq!(
            positions,
            [
                ("docs/a.md", 1, 1, 6),
                ("docs/a.md", 1, 8, 7),
                ("docs/a.md", 3, 4, 6)
            ]
        );
        assert_eq!(found.matches[0].text, "Item-1 item-22");
        let preview = preview_at(&root, r"item-(\d+)", "#${1}", &options).unwrap();
        assert_eq!(preview.files.len(), 1);
        assert_eq!(preview.files[0].path, "docs/a.md");
        assert_eq!(preview.files[0].count, found.matches.len());
        assert_eq!(preview.files[0].after, "#1 #22\r\nitems-3 끝\n😀 #4");
        let invalid = SearchOptions {
            regex: true,
            ..SearchOptions::default()
        };
        assert!(preview_at(&root, "(", "x", &invalid).is_err());
        assert!(advanced::search_within(&root, "", "(", &invalid).is_err());
    }
    #[test]
    fn expanding_replacements_are_bounded_before_allocation() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("a.md"), "a".repeat(1024)).unwrap();
        let preview = preview_at(&root, "a", &"b".repeat(8192), &SearchOptions::default()).unwrap();
        assert!(preview.files.is_empty());
        assert_eq!(preview.skipped, 1);
    }
    #[test]
    fn preview_is_literal_and_apply_preflight_blocks_conflicts_preserving_bom() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("a.md"), "\u{feff}Hello hello").unwrap();
        fs::write(root.join("b.md"), "hello").unwrap();
        let preview = preview_at(&root, "hello", "$1", &SearchOptions::default()).unwrap();
        assert_eq!(preview.files.len(), 2);
        assert_eq!(preview.files[0].after, "$1 $1");
        fs::write(root.join("b.md"), "external").unwrap();
        assert!(
            apply_at(&root, preview.files.clone())
                .unwrap()
                .iter()
                .all(|result| result.error.is_some())
        );
        assert!(
            fs::read_to_string(root.join("a.md"))
                .unwrap()
                .contains("Hello")
        );
        assert!(
            apply_at(&root, vec![preview.files[0].clone()]).unwrap()[0]
                .error
                .is_none()
        );
        assert_eq!(
            fs::read_to_string(root.join("a.md")).unwrap(),
            "\u{feff}$1 $1"
        );
    }
}
