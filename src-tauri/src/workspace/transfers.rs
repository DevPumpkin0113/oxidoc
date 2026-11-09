use super::*;
use advanced::{move_without_overwrite, relative_entry, valid_name};

const MAX_TRANSFER_BYTES: u64 = 512 * 1024 * 1024;
const MAX_TRANSFER_DEPTH: usize = 64;

fn checked_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let resolved = contained_path(root, relative)?;
    let mut path = root.to_path_buf();
    for part in Path::new(relative).components() {
        path.push(part);
        if fs::symlink_metadata(&path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("심볼릭 링크는 복사·이동할 수 없습니다.".into());
        }
    }
    Ok(resolved)
}

fn collect(source: &Path, depth: usize, count: &mut usize, bytes: &mut u64) -> Result<(), String> {
    *count += 1;
    if depth > MAX_TRANSFER_DEPTH || *count > MAX_DIRECTORY_ENTRIES {
        return Err("복사·이동할 항목이 너무 많거나 폴더가 너무 깊습니다.".into());
    }
    let kind = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if kind.file_type().is_symlink() || (!kind.is_file() && !kind.is_dir()) {
        return Err("심볼릭 링크·특수 파일은 복사·이동할 수 없습니다.".into());
    }
    if kind.is_dir() {
        for child in fs::read_dir(source).map_err(|e| e.to_string())? {
            collect(
                &child.map_err(|e| e.to_string())?.path(),
                depth + 1,
                count,
                bytes,
            )?;
        }
    } else {
        *bytes = bytes.checked_add(kind.len()).ok_or("파일 크기 제한 초과")?;
        if *bytes > MAX_TRANSFER_BYTES {
            return Err("한 번에 512MB 이하만 복사·이동할 수 있습니다.".into());
        }
    }
    Ok(())
}

fn copy_tree(
    source: &Path,
    target: &Path,
    depth: usize,
    count: &mut usize,
    bytes: &mut u64,
) -> Result<(), String> {
    // Recheck during copying: a child may have changed since preflight.
    *count += 1;
    let metadata = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if depth > MAX_TRANSFER_DEPTH
        || *count > MAX_DIRECTORY_ENTRIES
        || metadata.file_type().is_symlink()
    {
        return Err("항목 제한 초과 또는 심볼릭 링크입니다.".into());
    }
    if metadata.is_dir() {
        fs::create_dir(target).map_err(|e| e.to_string())?;
        for child in fs::read_dir(source).map_err(|e| e.to_string())? {
            let child = child.map_err(|e| e.to_string())?;
            copy_tree(
                &child.path(),
                &target.join(child.file_name()),
                depth + 1,
                count,
                bytes,
            )?;
        }
    } else if metadata.is_file() {
        let mut input = fs::File::open(source)
            .map_err(|e| e.to_string())?
            .take(MAX_TRANSFER_BYTES.saturating_sub(*bytes) + 1);
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(|e| e.to_string())?;
        *bytes += std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
        if *bytes > MAX_TRANSFER_BYTES {
            return Err("복사 크기 제한 초과".into());
        }
    } else {
        return Err("특수 파일은 복사할 수 없습니다.".into());
    }
    Ok(())
}

fn transfer_at(
    root: &Path,
    path: &str,
    parent: &str,
    name: Option<&str>,
    cut: bool,
) -> Result<Entry, String> {
    let source = checked_path(root, path)?;
    if source == root {
        return Err("프로젝트 루트는 복사·이동할 수 없습니다.".into());
    }
    let parent = checked_path(root, parent)?;
    if !parent.is_dir() {
        return Err("대상 폴더가 아닙니다.".into());
    }
    if parent.starts_with(&source) {
        return Err("폴더를 자기 하위로 복사·이동할 수 없습니다.".into());
    }
    let name = name.unwrap_or(
        source
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("이름 오류")?,
    );
    valid_name(name)?;
    let target = parent.join(name);
    if target.try_exists().map_err(|e| e.to_string())? {
        return Err("같은 이름의 항목이 이미 있습니다.".into());
    }
    collect(&source, 0, &mut 0, &mut 0)?;
    if cut {
        move_without_overwrite(&source, &target)?;
    } else {
        // Publish only a completed copy; failures leave no partial destination.
        let staging = tempfile::tempdir_in(&parent).map_err(|e| e.to_string())?;
        let staged = staging.path().join(name);
        copy_tree(&source, &staged, 0, &mut 0, &mut 0)?;
        move_without_overwrite(&staged, &target)?;
    }
    relative_entry(root, &target)
}

#[tauri::command]
pub async fn transfer_entry(
    app: AppHandle,
    root: String,
    path: String,
    parent: String,
    name: Option<String>,
    cut: bool,
) -> Result<Entry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transfer_at(
            &authorized_root(&app, &root)?,
            &path,
            &parent,
            name.as_deref(),
            cut,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn folder_copy_move_duplicate_and_conflicts_preserve_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("source/nested")).unwrap();
        fs::create_dir(root.join("target")).unwrap();
        fs::write(root.join("source/nested/a.bin"), [0, 1, 255]).unwrap();
        assert_eq!(
            transfer_at(&root, "source", "target", None, false)
                .unwrap()
                .path,
            "target/source"
        );
        assert_eq!(
            fs::read(root.join("target/source/nested/a.bin")).unwrap(),
            [0, 1, 255]
        );
        assert!(root.join("source").exists());
        assert!(transfer_at(&root, "source", "target", None, true).is_err());
        assert!(transfer_at(&root, "source", "source/nested", None, false).is_err());
        assert!(transfer_at(&root, "", "target", None, true).is_err());
        assert!(transfer_at(&root, "../outside", "target", None, false).is_err());
        transfer_at(&root, "source", "", Some("duplicate"), false).unwrap();
        transfer_at(&root, "source", "target", Some("moved"), true).unwrap();
        assert!(!root.join("source").exists());
        assert_eq!(
            fs::read(root.join("target/moved/nested/a.bin")).unwrap(),
            [0, 1, 255]
        );
    }
}
