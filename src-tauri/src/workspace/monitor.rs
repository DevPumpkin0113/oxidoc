use super::*;

#[derive(Serialize)]
pub struct EntryStamp {
    path: String,
    stamp: Option<String>,
}
fn stamp_at(root: &Path, path: &str) -> Option<String> {
    let path = contained_path(root, path).ok()?;
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos();
    Some(format!(
        "{}:{modified}:{}",
        metadata.len(),
        metadata.is_dir()
    ))
}
#[tauri::command]
pub async fn probe_entries(
    app: AppHandle,
    root: String,
    paths: Vec<String>,
) -> Result<Vec<EntryStamp>, String> {
    if paths.len() > MAX_DIRECTORY_ENTRIES {
        return Err("감지할 항목이 너무 많습니다.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = authorized_root(&app, &root)?;
        Ok(paths
            .into_iter()
            .map(|path| EntryStamp {
                stamp: stamp_at(&root, &path),
                path,
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stamps_detect_modification_deletion_and_reject_escape() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("a.md"), "before").unwrap();
        let before = stamp_at(&root, "a.md").unwrap();
        fs::write(root.join("a.md"), "different length").unwrap();
        assert_ne!(stamp_at(&root, "a.md").unwrap(), before);
        fs::remove_file(root.join("a.md")).unwrap();
        assert!(stamp_at(&root, "a.md").is_none());
        assert!(stamp_at(&root, "../outside").is_none());
    }
}
