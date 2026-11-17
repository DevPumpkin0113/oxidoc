//! Markdown sources for updating links after a move or rename. The frontend
//! parses them with the same Markdown parser as the preview.
use super::*;

/// Total text returned at once; larger projects report `truncated`.
const MAX_MARKDOWN_BYTES: usize = 64 * 1024 * 1024;

#[derive(Serialize)]
pub struct TextFile {
    path: String,
    text: String,
}
#[derive(Serialize)]
pub struct TextFiles {
    files: Vec<TextFile>,
    truncated: bool,
    skipped: usize,
}

fn is_markdown(path: &str) -> bool {
    path.rsplit('.')
        .next()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        && path.contains('.')
}

fn markdown_files(files: &ProjectFiles) -> TextFiles {
    let index = &files.index;
    let mut result = TextFiles {
        files: Vec::new(),
        truncated: index.truncated,
        skipped: 0,
    };
    let mut bytes = 0;
    for entry in index
        .entries
        .iter()
        .filter(|entry| is_markdown(&entry.path))
    {
        let Some(text) = files.text(&entry.path) else {
            result.skipped += 1;
            continue;
        };
        bytes += text.len();
        if bytes > MAX_MARKDOWN_BYTES {
            result.truncated = true;
            break;
        }
        result.files.push(TextFile {
            path: entry.path.clone(),
            text: text.to_string(),
        });
    }
    result
}

#[tauri::command]
pub async fn markdown_texts(app: AppHandle, root: String) -> Result<TextFiles, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = authorized_root(&app, &root)?;
        Ok(markdown_files(&project_files(&app, &root, &folder)?))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_markdown_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir(root.join("docs")).unwrap();
        fs::write(root.join("docs/a.md"), "[b](../b.MD)").unwrap();
        fs::write(root.join("b.MD"), "# B").unwrap();
        fs::write(root.join("c.txt"), "text").unwrap();
        fs::write(root.join("md"), "no extension").unwrap();
        let mut paths: Vec<_> = markdown_files(&ProjectFiles::uncached(&root).unwrap())
            .files
            .into_iter()
            .map(|file| (file.path, file.text))
            .collect();
        paths.sort();
        assert_eq!(
            paths,
            [
                ("b.MD".to_string(), "# B".to_string()),
                ("docs/a.md".to_string(), "[b](../b.MD)".to_string())
            ]
        );
    }
}
