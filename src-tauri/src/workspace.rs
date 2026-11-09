use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;
mod advanced;
mod registry;
pub use advanced::*;

const MAX_DOCUMENT_BYTES: u64 = 5 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES: usize = 10_000;
pub struct RegistryGate(pub Mutex<()>);

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub last_opened: u64,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    path: String,
    name: String,
    is_directory: bool,
}

fn projects(app: &AppHandle) -> Result<Vec<Project>, String> {
    registry::read(
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("projects.json"),
    )
}
fn authorized_root(app: &AppHandle, root: &str) -> Result<PathBuf, String> {
    if !projects(app)?.iter().any(|project| project.path == root) {
        return Err("등록되지 않은 프로젝트입니다. 폴더를 먼저 선택해 주세요.".into());
    }
    fs::canonicalize(root).map_err(|_| "프로젝트 폴더를 찾거나 접근할 수 없습니다.".into())
}

fn contained_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if Path::new(relative)
        .components()
        .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("프로젝트 외부 경로에는 접근할 수 없습니다.".into());
    }
    let resolved =
        fs::canonicalize(root.join(relative)).map_err(|e| format!("경로 접근 실패: {e}"))?;
    if !resolved.starts_with(root) {
        return Err("프로젝트 외부 경로에는 접근할 수 없습니다.".into());
    }
    Ok(resolved)
}

fn directory_entries(root: &Path, relative: &str) -> Result<Vec<Entry>, String> {
    let directory = contained_path(root, relative)?;
    let mut entries = Vec::new();
    for item in fs::read_dir(directory).map_err(|e| format!("폴더 읽기 실패: {e}"))? {
        let item = item.map_err(|e| e.to_string())?;
        let kind = item.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() || (!kind.is_dir() && !kind.is_file()) {
            continue;
        }
        let canonical = fs::canonicalize(item.path()).map_err(|e| e.to_string())?;
        if !canonical.starts_with(root) {
            continue;
        }
        entries.push(Entry {
            path: canonical
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/"),
            name: item.file_name().to_string_lossy().into_owned(),
            is_directory: kind.is_dir(),
        });
        if entries.len() > MAX_DIRECTORY_ENTRIES {
            return Err("폴더 항목이 너무 많습니다(최대 10,000개).".into());
        }
    }
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn read_text(path: &Path) -> Result<(String, bool), String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| format!("문서 열기 실패: {e}"))?
        .take(MAX_DOCUMENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("5MB 이하 문서만 열 수 있습니다.".into());
    }
    if bytes.contains(&0) {
        return Err("바이너리 파일은 편집할 수 없습니다.".into());
    }
    let bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
    let text = String::from_utf8(if bom { bytes[3..].to_vec() } else { bytes })
        .map_err(|_| "UTF-8 문서만 편집할 수 있습니다.".to_string())?;
    Ok((text, bom))
}

fn write_text(path: &Path, content: &str, expected: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("5MB 이하 문서만 저장할 수 있습니다.".into());
    }
    let (current, bom) = read_text(path)?;
    if current != expected {
        return Err(
            "파일이 외부에서 변경되었습니다. 변경 내용을 복사한 뒤 문서를 다시 열어 주세요.".into(),
        );
    }
    let parent = path.parent().ok_or("저장 경로가 올바르지 않습니다.")?;
    let permissions = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    if permissions.readonly() {
        return Err("읽기 전용 파일입니다.".into());
    }
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|e| format!("저장 준비 실패: {e}"))?;
    if bom {
        temporary
            .write_all(&[0xEF, 0xBB, 0xBF])
            .map_err(|e| e.to_string())?;
    }
    temporary
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .as_file()
        .set_permissions(permissions)
        .map_err(|e| e.to_string())?;
    temporary
        .persist(path)
        .map_err(|e| format!("파일 저장 실패: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        projects(&app).map(|all| all.into_iter().map(advanced::with_status).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_project(app: AppHandle) -> Result<Option<Project>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title(crate::settings::localized(
            &app,
            "프로젝트 폴더 열기",
            "Open project folder",
        ));
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let Some(selected) = dialog.blocking_pick_folder() else {
            return Ok(None);
        };
        let path = fs::canonicalize(selected.into_path().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if !path.is_dir() {
            return Err("프로젝트 폴더를 선택해 주세요.".into());
        }
        let project = Project {
            name: path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.display().to_string()),
            path: path.to_string_lossy().into_owned(),
            ..Project::default()
        };
        let gate = app.state::<RegistryGate>();
        let _guard = gate.0.lock().map_err(|e| e.to_string())?;
        let mut all = projects(&app)?;
        if let Some(existing) = all.iter().find(|existing| {
            advanced::path_key(&existing.path) == advanced::path_key(&project.path)
        }) {
            return Ok(Some(advanced::with_status(existing.clone())));
        }
        all.push(project.clone());
        advanced::persist_projects(&app, &all)?;
        Ok(Some(project))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_entries(
    app: AppHandle,
    root: String,
    path: String,
) -> Result<Vec<Entry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        directory_entries(&authorized_root(&app, &root)?, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_document(app: AppHandle, root: String, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_text(&contained_path(&authorized_root(&app, &root)?, &path)?)
            .map(|(content, _)| content)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_document(
    app: AppHandle,
    root: String,
    path: String,
    content: String,
    expected: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_text(
            &contained_path(&authorized_root(&app, &root)?, &path)?,
            &content,
            &expected,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn traversal_and_absolute_paths_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap();
        assert!(contained_path(&root, "../outside.md").is_err());
        assert!(contained_path(&root, &root.display().to_string()).is_err());
    }
    #[test]
    fn nested_entries_sorted_and_readable() {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap();
        fs::create_dir(root.join("notes")).unwrap();
        fs::write(root.join("readme.md"), "안녕하세요").unwrap();
        fs::write(root.join("notes/idea.md"), "# Idea").unwrap();
        let entries = directory_entries(&root, "").unwrap();
        assert!(entries[0].is_directory);
        assert_eq!(
            read_text(&contained_path(&root, "notes/idea.md").unwrap())
                .unwrap()
                .0,
            "# Idea"
        );
    }
    #[test]
    fn save_preserves_bom_and_rejects_conflicts() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.md");
        fs::write(&path, "\u{feff}# Before\r\n").unwrap();
        write_text(&path, "# After\r\n", "# Before\r\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "\u{feff}# After\r\n");
        assert!(write_text(&path, "lost update", "# Before\r\n").is_err());
        assert_eq!(read_text(&path).unwrap().0, "# After\r\n");
    }
    #[test]
    fn binary_and_oversized_documents_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.md");
        fs::write(&path, [0, 1, 2]).unwrap();
        assert!(read_text(&path).is_err());
        fs::write(&path, vec![b'x'; MAX_DOCUMENT_BYTES as usize + 1]).unwrap();
        assert!(read_text(&path).is_err());
    }
}
