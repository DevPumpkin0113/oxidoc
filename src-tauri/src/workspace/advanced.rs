use super::*;
use base64::Engine;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_opener::OpenerExt;

async fn io<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}
pub(super) fn path_key(path: &str) -> String {
    if cfg!(windows) {
        path.trim_start_matches("\\\\?\\")
            .replace('/', "\\")
            .to_lowercase()
    } else {
        path.into()
    }
}
pub(super) fn with_status(mut project: Project) -> Project {
    project.status = match fs::read_dir(&project.path) {
        Ok(_) => "available",
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "missing",
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => "denied",
        Err(_) => "unavailable",
    }
    .into();
    project
}
pub(super) fn persist_projects(app: &AppHandle, all: &[Project]) -> Result<(), String> {
    registry::write(
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("projects.json"),
        all,
    )
}
pub(super) fn valid_name(name: &str) -> Result<(), String> {
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    if name.is_empty()
        || name.trim() != name
        || name.ends_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || name == "."
        || name == ".."
        || ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.ends_with(['1', '2', '3', '4', '5', '6', '7', '8', '9']))
    {
        return Err("사용할 수 없는 파일·폴더 이름입니다.".into());
    }
    Ok(())
}
fn new_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    let name = relative
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("파일 이름이 필요합니다.")?;
    valid_name(name)?;
    let parent = contained_path(
        root,
        relative.parent().and_then(|p| p.to_str()).unwrap_or(""),
    )?;
    if !parent.is_dir() {
        return Err("대상 폴더가 아닙니다.".into());
    }
    Ok(parent.join(name))
}
pub(super) fn relative_entry(root: &Path, path: &Path) -> Result<Entry, String> {
    Ok(Entry {
        path: path
            .strip_prefix(root)
            .map_err(|_| "프로젝트 외부 경로입니다.")?
            .to_string_lossy()
            .replace('\\', "/"),
        name: path
            .file_name()
            .ok_or("이름이 없습니다.")?
            .to_string_lossy()
            .into_owned(),
        is_directory: path.is_dir(),
    })
}
fn create_at(root: &Path, parent: &str, name: &str, directory: bool) -> Result<Entry, String> {
    valid_name(name)?;
    let parent = contained_path(root, parent)?;
    let target = parent.join(name);
    if directory {
        fs::create_dir(&target).map_err(|e| format!("폴더 생성 실패: {e}"))?;
    } else {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|e| format!("문서 생성 실패: {e}"))?;
    }
    relative_entry(root, &target)
}
fn rename_at(root: &Path, path: &str, name: &str) -> Result<Entry, String> {
    valid_name(name)?;
    let source = contained_path(root, path)?;
    if source == root {
        return Err("프로젝트 루트는 이름을 변경할 수 없습니다.".into());
    }
    let target = source.parent().ok_or("상위 폴더가 없습니다.")?.join(name);
    if target.exists() && path_key(&target.to_string_lossy()) != path_key(&source.to_string_lossy())
    {
        return Err("같은 이름의 항목이 이미 있습니다.".into());
    }
    fs::rename(&source, &target).map_err(|e| format!("이름 변경 실패: {e}"))?;
    relative_entry(root, &target)
}
#[cfg(windows)]
pub(super) fn move_without_overwrite(source: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    // No REPLACE_EXISTING flag: a concurrent destination creation must also fail safely.
    let moved = unsafe {
        windows_sys::Win32::Storage::FileSystem::MoveFileExW(source.as_ptr(), target.as_ptr(), 0)
    };
    if moved == 0 {
        return Err(format!(
            "파일 이동 실패: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}
#[cfg(not(windows))]
pub(super) fn move_without_overwrite(source: &Path, target: &Path) -> Result<(), String> {
    fs::hard_link(source, target).map_err(|e| format!("파일 이동 실패: {e}"))?;
    fs::remove_file(source).map_err(|e| format!("대상 복사본 생성 후 원본 제거 실패: {e}"))
}
fn move_file_at(root: &Path, path: &str, parent: &str) -> Result<Entry, String> {
    let source = contained_path(root, path)?;
    let kind = fs::symlink_metadata(root.join(path))
        .map_err(|e| e.to_string())?
        .file_type();
    if source == root || !kind.is_file() || kind.is_symlink() {
        return Err("파일만 이동할 수 있습니다.".into());
    }
    let parent = contained_path(root, parent)?;
    if !parent.is_dir() {
        return Err("대상 폴더가 아닙니다.".into());
    }
    let target = parent.join(source.file_name().ok_or("파일 이름이 필요합니다.")?);
    if path_key(&target.to_string_lossy()) == path_key(&source.to_string_lossy()) {
        return relative_entry(root, &source);
    }
    if target.try_exists().map_err(|e| e.to_string())? {
        return Err("같은 이름의 항목이 이미 있습니다.".into());
    }
    move_without_overwrite(&source, &target)?;
    relative_entry(root, &target)
}
#[tauri::command]
pub async fn move_file(
    app: AppHandle,
    root: String,
    path: String,
    parent: String,
) -> Result<Entry, String> {
    io(move || move_file_at(&authorized_root(&app, &root)?, &path, &parent)).await
}
#[tauri::command]
pub async fn create_entry(
    app: AppHandle,
    root: String,
    parent: String,
    name: String,
    is_directory: bool,
) -> Result<Entry, String> {
    io(move || create_at(&authorized_root(&app, &root)?, &parent, &name, is_directory)).await
}
#[tauri::command]
pub async fn rename_entry(
    app: AppHandle,
    root: String,
    path: String,
    name: String,
) -> Result<Entry, String> {
    io(move || rename_at(&authorized_root(&app, &root)?, &path, &name)).await
}
#[tauri::command]
pub async fn delete_entry(app: AppHandle, root: String, path: String) -> Result<(), String> {
    io(move || trash_at(&authorized_root(&app, &root)?, &path)).await
}
fn trash_at(root: &Path, path: &str) -> Result<(), String> {
    let target = contained_path(root, path)?;
    if target == root {
        return Err("프로젝트 루트는 삭제할 수 없습니다.".into());
    }
    trash::delete(target).map_err(|e| format!("휴지통 이동 실패: {e}"))
}
#[tauri::command]
pub async fn pick_save_path(
    app: AppHandle,
    root: String,
    path: String,
) -> Result<Option<String>, String> {
    io(move || {
        let root = authorized_root(&app, &root)?;
        let source = save_dialog_source(&root, &path)?;
        let mut dialog = app
            .dialog()
            .file()
            .set_title(crate::settings::localized(
                &app,
                "다른 이름으로 저장 — 현재 프로젝트 안",
                "Save As — inside current project",
            ))
            .set_directory(source.parent().unwrap_or(&root))
            .set_file_name(source.file_name().unwrap_or_default().to_string_lossy());
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let Some(selected) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let selected = selected.into_path().map_err(|e| e.to_string())?;
        let parent = fs::canonicalize(selected.parent().ok_or("폴더를 선택해 주세요.")?)
            .map_err(|e| e.to_string())?;
        if !parent.starts_with(&root) {
            return Err("현재 프로젝트 안에 저장해 주세요.".into());
        }
        let target = parent.join(selected.file_name().ok_or("파일 이름이 필요합니다.")?);
        let entry = relative_entry(&root, &target)?;
        new_path(&root, &entry.path)?;
        Ok(Some(entry.path))
    })
    .await
}
fn save_dialog_source(root: &Path, path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path
        .components()
        .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("프로젝트 외부 경로입니다.".into());
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("파일 이름 오류")?;
    valid_name(name)?;
    let parent = contained_path(
        root,
        path.parent().and_then(|path| path.to_str()).unwrap_or(""),
    )
    .ok()
    .filter(|parent| parent.is_dir())
    .unwrap_or_else(|| root.to_path_buf());
    Ok(parent.join(name))
}
fn save_as_at(
    root: &Path,
    path: &str,
    content: &str,
    expected: Option<&str>,
) -> Result<(), String> {
    if content.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("5MB 이하 문서만 저장할 수 있습니다.".into());
    }
    let target = new_path(root, path)?;
    if target.exists() {
        let actual = contained_path(root, path)?;
        return write_text(
            &actual,
            content,
            expected.ok_or("대상 파일이 새로 생성되었습니다. 다시 확인해 주세요.")?,
        );
    }
    if expected.is_some() {
        return Err("저장 대상이 외부에서 삭제되었습니다.".into());
    }
    let mut file = tempfile::NamedTempFile::new_in(target.parent().ok_or("상위 경로가 없습니다.")?)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist_noclobber(target).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn save_document_as(
    app: AppHandle,
    root: String,
    path: String,
    content: String,
    expected: Option<String>,
) -> Result<(), String> {
    io(move || {
        save_as_at(
            &authorized_root(&app, &root)?,
            &path,
            &content,
            expected.as_deref(),
        )
    })
    .await
}
#[tauri::command]
pub async fn target_content(
    app: AppHandle,
    root: String,
    path: String,
) -> Result<Option<String>, String> {
    io(move || {
        let root = authorized_root(&app, &root)?;
        if !new_path(&root, &path)?.exists() {
            return Ok(None);
        }
        read_text(&contained_path(&root, &path)?).map(|(text, _)| Some(text))
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    name: Option<String>,
    favorite: Option<bool>,
    tags: Option<Vec<String>>,
    touch: Option<bool>,
}
#[tauri::command]
pub async fn update_project(
    app: AppHandle,
    path: String,
    patch: ProjectPatch,
) -> Result<Vec<Project>, String> {
    io(move || {
        let gate = app.state::<RegistryGate>();
        let _guard = gate.0.lock().map_err(|e| e.to_string())?;
        let mut all = projects(&app)?;
        let item = all
            .iter_mut()
            .find(|p| p.path == path)
            .ok_or("프로젝트를 찾을 수 없습니다.")?;
        if let Some(name) = patch.name {
            if name.trim().is_empty() || name.len() > 200 {
                return Err("프로젝트 이름은 1~200자로 입력해 주세요.".into());
            }
            item.name = name.trim().into();
        }
        if let Some(favorite) = patch.favorite {
            item.favorite = favorite;
        }
        if let Some(tags) = patch.tags {
            if tags.len() > 30 || tags.iter().any(|t| t.len() > 80) {
                return Err("태그는 30개 이하, 각각 80자 이하로 입력해 주세요.".into());
            }
            item.tags = tags
                .into_iter()
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect();
            item.tags.sort();
            item.tags.dedup();
        }
        if patch.touch == Some(true) {
            item.last_opened = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis() as u64;
        }
        persist_projects(&app, &all)?;
        Ok(all.into_iter().map(with_status).collect())
    })
    .await
}
#[tauri::command]
pub async fn remove_project(app: AppHandle, path: String) -> Result<Vec<Project>, String> {
    io(move || {
        let gate = app.state::<RegistryGate>();
        let _guard = gate.0.lock().map_err(|e| e.to_string())?;
        let mut all = projects(&app)?;
        all.retain(|p| p.path != path);
        persist_projects(&app, &all)?;
        Ok(all.into_iter().map(with_status).collect())
    })
    .await
}
#[tauri::command]
pub async fn relocate_project(
    app: AppHandle,
    path: String,
) -> Result<Option<Vec<Project>>, String> {
    io(move || {
        let mut dialog = app.dialog().file().set_title(crate::settings::localized(
            &app,
            "이동한 프로젝트 폴더 다시 연결",
            "Relink project folder",
        ));
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let Some(selected) = dialog.blocking_pick_folder() else {
            return Ok(None);
        };
        let root = fs::canonicalize(selected.into_path().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if !root.is_dir() {
            return Err("폴더를 선택해 주세요.".into());
        }
        let new = root.to_string_lossy().into_owned();
        let gate = app.state::<RegistryGate>();
        let _guard = gate.0.lock().map_err(|e| e.to_string())?;
        let mut all = projects(&app)?;
        let original = all.clone();
        if all
            .iter()
            .any(|p| p.path != path && path_key(&p.path) == path_key(&new))
        {
            return Err("이미 등록한 프로젝트 경로입니다.".into());
        }
        let project = all
            .iter_mut()
            .find(|p| p.path == path)
            .ok_or("프로젝트를 찾을 수 없습니다.")?;
        project.path = new.clone();
        let store = app.store("sessions.json").map_err(|e| e.to_string())?;
        let previous_new = store.get(&new);
        let previous_old = store.get(&path);
        let previous_app = store.get("app");
        let recovery_directory = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("recovery");
        let copied_recovery = recovery::prepare_relink(&recovery_directory, &path, &new)?;
        if let Err(error) = persist_projects(&app, &all) {
            if copied_recovery {
                recovery::remove_relinked(&recovery_directory, &new);
            }
            return Err(error);
        }
        if let Some(session) = store.get(&path) {
            store.set(&new, session);
            if path != new {
                store.delete(&path);
            }
        }
        if let Some(mut state) = previous_app.clone()
            && state.get("lastProject").and_then(|v| v.as_str()) == Some(&path)
        {
            state["lastProject"] = serde_json::Value::String(new.clone());
            store.set("app", state);
        }
        if let Err(error) = store.save() {
            if copied_recovery {
                recovery::remove_relinked(&recovery_directory, &new);
            }
            for (key, value) in [
                (&new, previous_new),
                (&path, previous_old),
                (&"app".to_string(), previous_app),
            ] {
                if let Some(value) = value {
                    store.set(key, value);
                } else {
                    store.delete(key);
                }
            }
            persist_projects(&app, &original)
                .map_err(|rollback| format!("{error}; 프로젝트 복구 실패: {rollback}"))?;
            return Err(error.to_string());
        }
        if copied_recovery {
            recovery::remove_relinked(&recovery_directory, &path);
        }
        Ok(Some(all.into_iter().map(with_status).collect()))
    })
    .await
}

#[tauri::command]
pub async fn load_workspace_state(app: AppHandle) -> Result<serde_json::Value, String> {
    io(move || {
        let store = app.store("sessions.json").map_err(|e| e.to_string())?;
        Ok(store.get("app").unwrap_or(serde_json::json!({})))
    })
    .await
}
#[tauri::command]
pub async fn load_session(app: AppHandle, root: String) -> Result<serde_json::Value, String> {
    io(move || {
        authorized_root(&app, &root)?;
        let store = app.store("sessions.json").map_err(|e| e.to_string())?;
        Ok(store.get(&root).unwrap_or(serde_json::json!({})))
    })
    .await
}
#[tauri::command]
pub async fn save_session(
    app: AppHandle,
    root: String,
    session: serde_json::Value,
    layout: serde_json::Value,
) -> Result<(), String> {
    io(move || {
        let gate = app.state::<RegistryGate>();
        let _guard = gate.0.lock().map_err(|e| e.to_string())?;
        // Session metadata remains writable when a registered folder has moved.
        // File access commands still require canonicalize through authorized_root.
        if !projects(&app)?.iter().any(|project| project.path == root) {
            return Err("등록되지 않은 프로젝트입니다.".into());
        }
        if serde_json::to_vec(&(&session, &layout))
            .map_err(|e| e.to_string())?
            .len()
            > 128 * 1024
        {
            return Err("세션 데이터가 너무 큽니다.".into());
        }
        let store = app.store("sessions.json").map_err(|e| e.to_string())?;
        store.set(&root, session);
        store.set(
            "app",
            serde_json::json!({"lastProject":root,"layout":layout}),
        );
        store.save().map_err(|e| e.to_string())
    })
    .await
}

#[derive(Serialize)]
pub struct SearchMatch {
    path: String,
    name: String,
    line: usize,
    column: usize,
    text: String,
}
#[derive(Serialize)]
pub struct SearchResults {
    matches: Vec<SearchMatch>,
    truncated: bool,
    skipped: usize,
}
#[cfg(test)]
fn search_at(root: &Path, query: &str, case_sensitive: bool) -> Result<SearchResults, String> {
    search_within(root, "", query, case_sensitive)
}
fn search_within(
    root: &Path,
    folder: &str,
    query: &str,
    case_sensitive: bool,
) -> Result<SearchResults, String> {
    let directory = contained_path(root, folder)?;
    if !directory.is_dir() {
        return Err("대상 폴더가 아닙니다.".into());
    }
    let mut result = SearchResults {
        matches: Vec::new(),
        truncated: false,
        skipped: 0,
    };
    if query.is_empty() {
        return Ok(result);
    }
    if query.len() > 512 {
        return Err("검색어가 너무 깁니다.".into());
    }
    let pattern = regex::RegexBuilder::new(&regex::escape(query))
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| e.to_string())?;
    let mut pending = vec![(directory, 0usize)];
    let mut visited = 0;
    while let Some((directory, depth)) = pending.pop() {
        if depth > 64 {
            result.skipped += 1;
            continue;
        }
        let entries = match fs::read_dir(directory) {
            Ok(e) => e,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > 20_000 || result.matches.len() >= 500 {
                result.truncated = true;
                return Ok(result);
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
                continue;
            }
            let Ok(path) = fs::canonicalize(entry.path()) else {
                result.skipped += 1;
                continue;
            };
            if !path.starts_with(root) {
                continue;
            }
            if kind.is_dir() {
                if ![".git", "node_modules", "target", "dist"]
                    .contains(&entry.file_name().to_string_lossy().as_ref())
                {
                    pending.push((path, depth + 1));
                }
                continue;
            }
            if !kind.is_file() {
                continue;
            }
            let Ok((text, _)) = read_text(&path) else {
                result.skipped += 1;
                continue;
            };
            for (line_number, line) in text.lines().enumerate() {
                for found in pattern.find_iter(line) {
                    let entry = relative_entry(root, &path)?;
                    result.matches.push(SearchMatch {
                        path: entry.path,
                        name: entry.name,
                        line: line_number + 1,
                        column: line[..found.start()].encode_utf16().count() + 1,
                        text: line.chars().take(240).collect(),
                    });
                    if result.matches.len() >= 500 {
                        result.truncated = true;
                        return Ok(result);
                    }
                }
            }
        }
    }
    Ok(result)
}
#[tauri::command]
pub async fn search_project(
    app: AppHandle,
    root: String,
    query: String,
    case_sensitive: bool,
    folder: Option<String>,
) -> Result<SearchResults, String> {
    io(move || {
        search_within(
            &authorized_root(&app, &root)?,
            folder.as_deref().unwrap_or(""),
            &query,
            case_sensitive,
        )
    })
    .await
}
#[tauri::command]
pub async fn read_image(app: AppHandle, root: String, path: String) -> Result<String, String> {
    io(move || {
        let path = contained_path(&authorized_root(&app, &root)?, &path)?;
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mime =
            match ext.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "avif" => "image/avif",
                "bmp" => "image/bmp",
                _ => return Err(
                    "지원하지 않는 이미지 형식입니다. PNG/JPEG/GIF/WebP/AVIF/BMP를 사용해 주세요."
                        .into(),
                ),
            };
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(10 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 10 * 1024 * 1024 {
            return Err("이미지는 10MB 이하만 지원합니다.".into());
        }
        Ok(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })
    .await
}
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&parsed.scheme()) {
        return Err("HTTP/HTTPS 링크만 열 수 있습니다.".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
fn explorer_target(root: &Path, path: &str) -> Result<PathBuf, String> {
    let path = contained_path(root, path)?;
    if !path.is_file() && !path.is_dir() {
        return Err("지원하지 않는 파일 형식입니다.".into());
    }
    Ok(path)
}
fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        value.trim_start_matches(r"\\?\").into()
    }
}
#[tauri::command]
pub async fn entry_path(app: AppHandle, root: String, path: String) -> Result<String, String> {
    io(move || {
        explorer_target(&authorized_root(&app, &root)?, &path).map(|path| display_path(&path))
    })
    .await
}
#[tauri::command]
pub async fn open_in_explorer(app: AppHandle, root: String, path: String) -> Result<(), String> {
    io(move || {
        let path = explorer_target(&authorized_root(&app, &root)?, &path)?;
        if path.is_dir() {
            app.opener().open_path(display_path(&path), None::<&str>)
        } else {
            app.opener().reveal_item_in_dir(path)
        }
        .map_err(|e| format!("탐색기 열기 실패: {e}"))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explorer_paths_and_search_folder_stay_inside_registered_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir(root.join("docs")).unwrap();
        fs::write(root.join("docs/a.md"), "needle").unwrap();
        fs::write(root.join("b.md"), "needle").unwrap();
        assert_eq!(explorer_target(&root, "").unwrap(), root);
        assert!(explorer_target(&root, "docs").unwrap().is_dir());
        assert!(explorer_target(&root, "docs/a.md").unwrap().is_file());
        assert!(explorer_target(&root, "../outside").is_err());
        assert!(explorer_target(&root, "missing").is_err());
        assert_eq!(
            display_path(Path::new(r"\\?\C:\notes\a.md")),
            r"C:\notes\a.md"
        );
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share")),
            r"\\server\share"
        );
        let found = search_within(&root, "docs", "needle", false).unwrap();
        assert_eq!(found.matches.len(), 1);
        assert_eq!(found.matches[0].path, "docs/a.md");
        assert!(search_within(&root, "..", "needle", false).is_err());
        assert!(search_within(&root, "b.md", "needle", false).is_err());
    }
    #[test]
    fn move_file_preserves_bytes_supports_root_and_rejects_conflicts_and_escape() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir(root.join("notes")).unwrap();
        fs::create_dir(root.join("target")).unwrap();
        let bytes = b"\xef\xbb\xbf# original\r\n\x00";
        fs::write(root.join("notes/a.md"), bytes).unwrap();
        let moved = move_file_at(&root, "notes/a.md", "target").unwrap();
        assert_eq!(moved.path, "target/a.md");
        assert!(!root.join("notes/a.md").exists());
        assert_eq!(fs::read(root.join("target/a.md")).unwrap(), bytes);
        assert_eq!(
            move_file_at(&root, "target/a.md", "target").unwrap().path,
            "target/a.md"
        );
        move_file_at(&root, "target/a.md", "").unwrap();
        fs::write(root.join("notes/a.md"), "do not overwrite").unwrap();
        assert!(move_file_at(&root, "a.md", "notes").is_err());
        assert_eq!(
            fs::read_to_string(root.join("notes/a.md")).unwrap(),
            "do not overwrite"
        );
        assert_eq!(fs::read(root.join("a.md")).unwrap(), bytes);
        assert!(move_without_overwrite(&root.join("a.md"), &root.join("notes/a.md")).is_err());
        assert_eq!(
            fs::read_to_string(root.join("notes/a.md")).unwrap(),
            "do not overwrite"
        );
        assert!(move_file_at(&root, "notes", "target").is_err());
        assert!(move_file_at(&root, "", "target").is_err());
        assert!(move_file_at(&root, "a.md", "notes/a.md").is_err());
        assert!(move_file_at(&root, "a.md", "missing").is_err());
        assert!(move_file_at(&root, "../outside.md", "notes").is_err());
        assert!(move_file_at(&root, "a.md", "..").is_err());
    }
    #[test]
    fn trash_moves_only_the_selected_temporary_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("oxidoc-trash-test.txt"), "temporary fixture").unwrap();
        fs::write(root.join("keep.txt"), "keep").unwrap();
        assert!(trash_at(&root, "").is_err());
        assert!(trash_at(&root, "../outside").is_err());
        trash_at(&root, "oxidoc-trash-test.txt").unwrap();
        assert!(!root.join("oxidoc-trash-test.txt").exists());
        assert_eq!(fs::read_to_string(root.join("keep.txt")).unwrap(), "keep");
    }
    #[test]
    fn canonical_paths_have_stable_identity() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("child")).unwrap();
        let first = fs::canonicalize(dir.path()).unwrap();
        let second = fs::canonicalize(dir.path().join("child/..")).unwrap();
        assert_eq!(
            path_key(&first.to_string_lossy()),
            path_key(&second.to_string_lossy())
        );
        if cfg!(windows) {
            assert_eq!(path_key(r"\\?\C:\Notes"), path_key("c:/notes"));
        }
    }
    #[test]
    fn create_rename_and_save_as_do_not_overwrite() {
        let missing = tempfile::tempdir().unwrap();
        let missing_root = fs::canonicalize(missing.path()).unwrap();
        assert_eq!(
            save_dialog_source(&missing_root, "deleted/a.md").unwrap(),
            missing_root.join("a.md")
        );
        assert!(save_dialog_source(&missing_root, "../escape.md").is_err());
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        create_at(&root, "", "notes", true).unwrap();
        create_at(&root, "notes", "a.md", false).unwrap();
        assert!(create_at(&root, "notes", "a.md", false).is_err());
        save_as_at(&root, "notes/b.md", "# B", None).unwrap();
        assert!(save_as_at(&root, "notes/b.md", "destroy", None).is_err());
        rename_at(&root, "notes/a.md", "c.md").unwrap();
        assert!(root.join("notes/c.md").exists());
        assert!(rename_at(&root, "notes/c.md", "b.md").is_err());
        assert!(new_path(&root, "../outside.md").is_err());
        assert!(create_at(&root, "", "CON", false).is_err());
    }
    #[test]
    fn search_returns_original_unicode_positions_and_nested_results() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub/a.md"), "😀 Test\nother test").unwrap();
        let found = search_at(&root, "test", false).unwrap();
        assert_eq!(found.matches.len(), 2);
        assert_eq!(found.matches[0].column, 4);
        assert_eq!(found.matches[0].path, "sub/a.md");
        assert_eq!(search_at(&root, "Test", true).unwrap().matches.len(), 1);
    }
    #[test]
    fn status_distinguishes_missing_folder() {
        let project = with_status(Project {
            path: "Z:/oxidoc-nonexistent-test-8ae4".into(),
            ..Project::default()
        });
        assert_eq!(project.status, "missing");
    }
}
