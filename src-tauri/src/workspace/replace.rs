use super::*;
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
fn preview_at(
    root: &Path,
    query: &str,
    replacement: &str,
    sensitive: bool,
) -> Result<ReplacePreview, String> {
    if query.is_empty() || query.len() > 512 || replacement.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("검색어·대체어 길이가 올바르지 않습니다.".into());
    }
    if replacement.contains('\0') {
        return Err("대체어에 NUL 문자를 사용할 수 없습니다.".into());
    }
    let pattern = regex::RegexBuilder::new(&regex::escape(query))
        .case_insensitive(!sensitive)
        .build()
        .map_err(|error| error.to_string())?;
    let index = index::index_at(root)?;
    let mut preview = ReplacePreview {
        files: vec![],
        truncated: index.truncated,
        skipped: index.skipped,
    };
    let mut bytes = 0;
    for entry in index.entries {
        let path = contained_path(root, &entry.path)?;
        let Ok((before, _)) = read_text(&path) else {
            preview.skipped += 1;
            continue;
        };
        let (count, matched_bytes) = pattern
            .find_iter(&before)
            .fold((0usize, 0usize), |(count, bytes), found| {
                (count + 1, bytes + found.len())
            });
        if count == 0 {
            continue;
        }
        let Some(estimated) = count
            .checked_mul(replacement.len())
            .and_then(|inserted| (before.len() - matched_bytes).checked_add(inserted))
        else {
            preview.skipped += 1;
            continue;
        };
        if estimated as u64 > MAX_DOCUMENT_BYTES {
            preview.skipped += 1;
            continue;
        }
        if preview.files.len() >= 100 || bytes + before.len() + estimated > 20 * 1024 * 1024 {
            preview.truncated = true;
            break;
        }
        let after = pattern
            .replace_all(&before, regex::NoExpand(replacement))
            .into_owned();
        if before == after {
            continue;
        }
        bytes += before.len() + after.len();
        preview.files.push(Replacement {
            path: entry.path,
            before,
            after,
            count,
        });
    }
    Ok(preview)
}
fn apply_at(root: &Path, files: Vec<Replacement>) -> Result<Vec<ReplaceResult>, String> {
    let mut bytes = 0;
    let mut paths = std::collections::HashSet::new();
    if files.len() > 100 {
        return Err("최대 100개 파일만 적용할 수 있습니다.".into());
    }
    for file in &files {
        bytes += file.before.len() + file.after.len();
        if bytes > 20 * 1024 * 1024
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
    sensitive: bool,
) -> Result<ReplacePreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        preview_at(
            &authorized_root(&app, &root)?,
            &query,
            &replacement,
            sensitive,
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
    fn expanding_replacements_are_bounded_before_allocation() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("a.md"), "a".repeat(1024)).unwrap();
        let preview = preview_at(&root, "a", &"b".repeat(8192), true).unwrap();
        assert!(preview.files.is_empty());
        assert_eq!(preview.skipped, 1);
    }
    #[test]
    fn preview_is_literal_and_apply_preflight_blocks_conflicts_preserving_bom() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("a.md"), "\u{feff}Hello hello").unwrap();
        fs::write(root.join("b.md"), "hello").unwrap();
        let preview = preview_at(&root, "hello", "$1", false).unwrap();
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
