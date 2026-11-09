use super::*;
#[derive(Serialize)]
pub struct FileIndex {
    pub(super) entries: Vec<Entry>,
    pub(super) truncated: bool,
    pub(super) skipped: usize,
}
pub(super) fn index_at(root: &Path) -> Result<FileIndex, String> {
    let mut result = FileIndex {
        entries: Vec::new(),
        truncated: false,
        skipped: 0,
    };
    let mut pending = vec![(root.to_path_buf(), 0)];
    let mut visited = 0;
    while let Some((directory, depth)) = pending.pop() {
        if depth > 64 {
            result.skipped += 1;
            continue;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if directory == root => return Err(error.to_string()),
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > 20_000 {
                result.truncated = true;
                break;
            }
            let Ok(entry) = entry else {
                result.skipped += 1;
                continue;
            };
            let Ok(kind) = entry.file_type() else {
                result.skipped += 1;
                continue;
            };
            if kind.is_symlink() {
                result.skipped += 1;
                continue;
            }
            let Ok(path) = fs::canonicalize(entry.path()) else {
                result.skipped += 1;
                continue;
            };
            if !path.starts_with(root) {
                result.skipped += 1;
                continue;
            }
            if kind.is_dir() {
                if ![".git", "node_modules", "target", "dist"]
                    .contains(&entry.file_name().to_string_lossy().as_ref())
                {
                    pending.push((path, depth + 1));
                }
            } else if kind.is_file() {
                result.entries.push(advanced::relative_entry(root, &path)?);
            }
        }
        if result.truncated {
            break;
        }
    }
    result
        .entries
        .sort_by_key(|entry| entry.path.to_lowercase());
    Ok(result)
}
#[tauri::command]
pub async fn index_files(app: AppHandle, root: String) -> Result<FileIndex, String> {
    tauri::async_runtime::spawn_blocking(move || index_at(&authorized_root(&app, &root)?))
        .await
        .map_err(|error| error.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn index_includes_nested_files_and_skips_dependency_directories() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir(root.join("docs")).unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("docs/a.md"), "a").unwrap();
        fs::write(root.join("node_modules/ignored"), "skip").unwrap();
        let result = index_at(&root).unwrap();
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].path, "docs/a.md");
        assert!(!result.truncated);
    }
}
