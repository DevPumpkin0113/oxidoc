use super::*;

const MAX_RECOVERY_BYTES: usize = 20 * 1024 * 1024;
const MAX_RECOVERY_FILE_BYTES: u64 = 128 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDocument {
    path: String,
    content: String,
    saved_content: String,
}
#[derive(Serialize, Deserialize)]
struct RecoveryFile {
    root: String,
    documents: Vec<RecoveryDocument>,
}
fn recovery_path(directory: &Path, root: &str) -> PathBuf {
    // Stable across process launches; the stored root also guards hash collisions.
    let hash = root
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    directory.join(format!("{hash:016x}.json"))
}
fn validate(documents: &[RecoveryDocument]) -> Result<(), String> {
    let mut total = 0usize;
    let mut paths = std::collections::HashSet::new();
    if documents.len() > 100 {
        return Err("복구 문서 최대 100개 제한".into());
    }
    for document in documents {
        if document.path.is_empty()
            || document.path.len() > 4096
            || Path::new(&document.path)
                .components()
                .any(|part| !matches!(part, Component::Normal(_)))
            || !paths.insert(advanced::path_key(&document.path))
        {
            return Err("복구 문서 경로가 올바르지 않습니다.".into());
        }
        if document.content.len() as u64 > MAX_DOCUMENT_BYTES
            || document.saved_content.len() as u64 > MAX_DOCUMENT_BYTES
        {
            return Err("복구 문서 크기 제한 초과".into());
        }
        total += document.content.len() + document.saved_content.len();
        if total > MAX_RECOVERY_BYTES {
            return Err("복구 데이터는 프로젝트별 20MB 이하만 저장할 수 있습니다.".into());
        }
    }
    Ok(())
}
fn read_at(path: &Path, root: &str) -> Result<Vec<RecoveryDocument>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("복구 데이터 읽기 실패: {error}")),
    };
    let mut bytes = Vec::new();
    file.take(MAX_RECOVERY_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_RECOVERY_FILE_BYTES {
        return Err("복구 데이터 크기 제한 초과".into());
    }
    let file: RecoveryFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("복구 데이터 형식 오류: {error}"))?;
    if file.root != root {
        return Err("복구 데이터 프로젝트 불일치".into());
    }
    validate(&file.documents)?;
    Ok(file.documents)
}
fn write_at(directory: &Path, root: &str, documents: Vec<RecoveryDocument>) -> Result<(), String> {
    validate(&documents)?;
    let path = recovery_path(directory, root);
    if documents.is_empty() {
        return match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }
    read_at(&path, root)?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
    serde_json::to_writer(
        &mut file,
        &RecoveryFile {
            root: root.into(),
            documents,
        },
    )
    .map_err(|error| error.to_string())?;
    file.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}
pub(super) fn prepare_relink(directory: &Path, old: &str, new: &str) -> Result<bool, String> {
    if old == new {
        return Ok(false);
    }
    let documents = read_at(&recovery_path(directory, old), old)?;
    if documents.is_empty() {
        return Ok(false);
    }
    if !read_at(&recovery_path(directory, new), new)?.is_empty() {
        return Err(
            "새 경로에 복구 데이터가 이미 있습니다. 먼저 해당 임시본을 확인해 주세요.".into(),
        );
    }
    write_at(directory, new, documents)?;
    Ok(true)
}
pub(super) fn remove_relinked(directory: &Path, root: &str) {
    let _ = fs::remove_file(recovery_path(directory, root));
}
fn directory(app: &AppHandle, root: &str) -> Result<PathBuf, String> {
    if !projects(app)?.iter().any(|project| project.path == root) {
        return Err("등록되지 않은 프로젝트입니다.".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("recovery"))
}
#[tauri::command]
pub async fn load_recovery(app: AppHandle, root: String) -> Result<Vec<RecoveryDocument>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let gate = app.state::<RegistryGate>();
        let _lock = gate.0.lock().map_err(|error| error.to_string())?;
        read_at(&recovery_path(&directory(&app, &root)?, &root), &root)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn save_recovery(
    app: AppHandle,
    root: String,
    documents: Vec<RecoveryDocument>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let gate = app.state::<RegistryGate>();
        let _lock = gate.0.lock().map_err(|error| error.to_string())?;
        write_at(&directory(&app, &root)?, &root, documents)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disk_recovery_is_scoped_atomic_validated_and_explicitly_discardable() {
        let dir = tempfile::tempdir().unwrap();
        let root = "C:/notes";
        let doc = RecoveryDocument {
            path: "docs/a.md".into(),
            content: "unsaved".into(),
            saved_content: "before".into(),
        };
        write_at(dir.path(), root, vec![doc.clone()]).unwrap();
        let path = recovery_path(dir.path(), root);
        assert!(prepare_relink(dir.path(), root, "C:/relocated").unwrap());
        assert_eq!(
            read_at(&recovery_path(dir.path(), "C:/relocated"), "C:/relocated").unwrap()[0].content,
            "unsaved"
        );
        assert!(path.exists());
        assert_eq!(read_at(&path, root).unwrap()[0].content, "unsaved");
        assert!(read_at(&path, "C:/other").is_err());
        let mut invalid = doc.clone();
        invalid.path = "../escape.md".into();
        assert!(write_at(dir.path(), root, vec![invalid]).is_err());
        assert_eq!(read_at(&path, root).unwrap()[0].content, "unsaved");
        fs::write(&path, "invalid JSON").unwrap();
        assert!(write_at(dir.path(), root, vec![doc]).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "invalid JSON");
        write_at(dir.path(), root, vec![]).unwrap();
        assert!(!path.exists());
    }
}
