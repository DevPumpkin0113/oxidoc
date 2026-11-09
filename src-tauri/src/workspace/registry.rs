use super::*;
use serde_json::{Map, Value};

fn read_document(path: &Path) -> Result<Map<String, Value>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Map::from_iter([(
                "projects".into(),
                Value::Array(Vec::new()),
            )]));
        }
        Err(error) => return Err(format!("프로젝트 목록 불러오기 실패: {error}")),
    };
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let mut document: Map<String, Value> = serde_json::from_slice(bytes)
        .map_err(|error| format!("프로젝트 목록 불러오기 실패: {error}"))?;
    // An empty object is the legacy Store representation of an unused registry.
    if document.is_empty() {
        document.insert("projects".into(), Value::Array(Vec::new()));
    }
    decode(&document)?;
    Ok(document)
}
fn decode(document: &Map<String, Value>) -> Result<Vec<Project>, String> {
    let value = document
        .get("projects")
        .ok_or("프로젝트 목록 형식이 올바르지 않습니다.")?;
    let projects: Vec<Project> = serde_json::from_value(value.clone())
        .map_err(|error| format!("프로젝트 목록 형식이 올바르지 않습니다.: {error}"))?;
    if projects
        .iter()
        .any(|project| project.name.is_empty() || project.path.is_empty())
    {
        return Err("프로젝트 목록 형식이 올바르지 않습니다.".into());
    }
    Ok(projects)
}
pub(super) fn read(path: &Path) -> Result<Vec<Project>, String> {
    decode(&read_document(path)?)
}
pub(super) fn write(path: &Path, projects: &[Project]) -> Result<(), String> {
    // Never turn a failed load into an empty registry or overwrite an unreadable file.
    let mut document = read_document(path)?;
    document.insert(
        "projects".into(),
        serde_json::to_value(projects).map_err(|e| e.to_string())?,
    );
    decode(&document)?;
    let parent = path
        .parent()
        .ok_or("프로젝트 저장 경로가 올바르지 않습니다.")?;
    fs::create_dir_all(parent).map_err(|e| format!("프로젝트 목록 저장 실패: {e}"))?;
    let mut pending = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if let Ok(metadata) = fs::metadata(path) {
        if metadata.permissions().readonly() {
            return Err("프로젝트 목록 파일이 읽기 전용입니다.".into());
        }
        pending
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|e| e.to_string())?;
    }
    let mut bytes = serde_json::to_vec_pretty(&document).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    pending
        .write_all(&bytes)
        .map_err(|e| format!("프로젝트 목록 저장 실패: {e}"))?;
    pending
        .as_file()
        .sync_all()
        .map_err(|e| format!("프로젝트 목록 저장 실패: {e}"))?;
    pending
        .persist(path)
        .map_err(|e| format!("프로젝트 목록 저장 실패: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_reopens_from_disk_preserving_favorites_tags_and_extra_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("projects.json");
        assert!(read(&path).unwrap().is_empty());
        fs::write(&path, br#"{"projects":[],"extra":{"keep":true}}"#).unwrap();
        let project = Project {
            name: "Notes".into(),
            path: "C:/notes".into(),
            favorite: true,
            tags: vec!["work".into()],
            ..Project::default()
        };
        write(&path, &[project]).unwrap();
        let reopened = read(&path).unwrap();
        assert_eq!(reopened.len(), 1);
        assert!(reopened[0].favorite);
        assert_eq!(reopened[0].tags, ["work"]);
        let mut external = read_document(&path).unwrap();
        external["projects"][0]["favorite"] = Value::Bool(false);
        fs::write(&path, serde_json::to_vec(&external).unwrap()).unwrap();
        assert!(!read(&path).unwrap()[0].favorite);
        assert_eq!(read_document(&path).unwrap()["extra"]["keep"], true);
    }
    #[test]
    fn invalid_or_unreadable_registry_is_not_silently_empty_or_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("projects.json");
        for bytes in [
            b"{".as_slice(),
            br#"{"projects":null}"#,
            br#"{"projects":[{}]}"#,
        ] {
            fs::write(&path, bytes).unwrap();
            assert!(read(&path).is_err());
            assert!(write(&path, &[]).is_err());
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
        let directory_path = dir.path().join("directory");
        fs::create_dir(&directory_path).unwrap();
        assert!(read(&directory_path).is_err());
        assert!(write(&directory_path, &[]).is_err());
        fs::write(&path, b"\xef\xbb\xbf{\"projects\":[]}").unwrap();
        assert!(read(&path).unwrap().is_empty());
        fs::write(&path, b"{}").unwrap();
        assert!(read(&path).unwrap().is_empty());
    }
    #[test]
    fn failed_readonly_write_preserves_existing_registry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("projects.json");
        let bytes = br#"{"projects":[{"name":"Notes","path":"C:/notes","favorite":true}]}"#;
        fs::write(&path, bytes).unwrap();
        let original = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let result = write(&path, &[]);
        let after = fs::read(&path).unwrap();
        fs::set_permissions(&path, original).unwrap();
        assert!(result.is_err());
        assert_eq!(after, bytes);
    }
}
