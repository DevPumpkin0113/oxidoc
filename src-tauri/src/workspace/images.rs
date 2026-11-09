use super::*;
use base64::Engine;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
fn image_extension(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") && bytes.len() >= 24 {
        return Ok("png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) && bytes.len() >= 4 {
        return Ok("jpg");
    }
    if (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) && bytes.len() >= 10 {
        return Ok("gif");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") && bytes.len() >= 16 {
        return Ok("webp");
    }
    Err("PNG·JPEG·GIF·WebP 이미지만 붙여넣을 수 있습니다.".into())
}
fn save_at(root: &Path, data: &str) -> Result<Entry, String> {
    if data.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err("이미지는 10MB 이하만 저장할 수 있습니다.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|error| error.to_string())?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("이미지는 10MB 이하만 저장할 수 있습니다.".into());
    }
    let extension = image_extension(&bytes)?;
    fs::create_dir_all(root.join("assets")).map_err(|error| error.to_string())?;
    let assets = contained_path(root, "assets")?;
    let mut file = tempfile::Builder::new()
        .prefix("image-")
        .suffix(&format!(".{extension}"))
        .tempfile_in(&assets)
        .map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
    file.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    let (_file, path) = file.keep().map_err(|error| error.to_string())?;
    advanced::relative_entry(root, &path)
}
#[tauri::command]
pub async fn save_pasted_image(
    app: AppHandle,
    root: String,
    data: String,
) -> Result<Entry, String> {
    tauri::async_runtime::spawn_blocking(move || save_at(&authorized_root(&app, &root)?, &data))
        .await
        .map_err(|error| error.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_images_are_unique_and_bytes_preserved_unsupported_data_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let png = base64::engine::general_purpose::STANDARD
            .encode([b"\x89PNG\r\n\x1a\n".as_slice(), &[0; 16]].concat());
        let first = save_at(&root, &png).unwrap();
        let second = save_at(&root, &png).unwrap();
        assert_ne!(first.path, second.path);
        assert!(first.path.starts_with("assets/image-"));
        assert_eq!(
            fs::read(root.join(first.path)).unwrap(),
            base64::engine::general_purpose::STANDARD
                .decode(png)
                .unwrap()
        );
        assert!(save_at(&root, "bm90IGFuIGltYWdl").is_err());
    }
}
