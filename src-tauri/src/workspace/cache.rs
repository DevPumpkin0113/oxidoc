use super::*;
use index::FileIndex;
use std::{collections::HashMap, sync::Arc};

/// Upper bound of cached file text; files beyond it are read on every search.
const MAX_CACHED_TEXT_BYTES: usize = 64 * 1024 * 1024;

/// File list and file texts of the watched project. Watcher events clear the
/// affected parts, so repeated searches neither walk the tree nor reread files.
#[derive(Default)]
pub struct ProjectCache {
    index: Mutex<Option<Arc<FileIndex>>>,
    texts: Mutex<TextCache>,
}

#[derive(Default)]
struct TextCache {
    /// `None` remembers files that cannot be read as text.
    texts: HashMap<String, Option<Arc<str>>>,
    bytes: usize,
    /// Bumped on every invalidation; a read that started earlier is not stored.
    generation: u64,
}

impl TextCache {
    fn remove(&mut self, path: &str) {
        if let Some(Some(text)) = self.texts.remove(path) {
            self.bytes -= text.len();
        }
    }
    fn remove_under(&mut self, folder: &str) {
        let prefix = format!("{folder}/");
        let paths: Vec<_> = self
            .texts
            .keys()
            .filter(|path| path.starts_with(&prefix))
            .cloned()
            .collect();
        for path in paths {
            self.remove(&path);
        }
    }
}

fn read_project_text(root: &Path, path: &str) -> Option<Arc<str>> {
    // Index paths were contained when walked, and a watched project drops its
    // index when files or folders are replaced. Only the path's form and the
    // file itself are re-checked; resolving every path again doubled search time.
    if Path::new(path)
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return None;
    }
    let full = root.join(path);
    if !fs::symlink_metadata(&full).ok()?.is_file() {
        return None;
    }
    read_text(&full).ok().map(|(text, _)| Arc::from(text))
}

impl ProjectCache {
    /// Drops cached data for changed paths. Structural changes (create,
    /// remove, rename) also drop the file list and anything under the paths.
    pub fn forget(&self, paths: &[String], structural: bool, rescan: bool) {
        if (structural || rescan)
            && let Ok(mut index) = self.index.lock()
        {
            *index = None;
        }
        let Ok(mut texts) = self.texts.lock() else {
            return;
        };
        texts.generation += 1;
        if rescan {
            texts.texts.clear();
            texts.bytes = 0;
            return;
        }
        for path in paths {
            texts.remove(path);
            if structural {
                texts.remove_under(path);
            }
        }
    }

    fn index(&self, root: &Path) -> Result<Arc<FileIndex>, String> {
        // Held while indexing so concurrent requests share one walk; an
        // invalidation arriving meanwhile waits and then clears the fresh list.
        let mut cached = self.index.lock().map_err(|e| e.to_string())?;
        if let Some(index) = cached.as_ref() {
            return Ok(index.clone());
        }
        let index = Arc::new(index::index_at(root)?);
        *cached = Some(index.clone());
        Ok(index)
    }

    fn text(&self, root: &Path, path: &str) -> Option<Arc<str>> {
        let generation = {
            let texts = self.texts.lock().ok()?;
            if let Some(hit) = texts.texts.get(path) {
                return hit.clone();
            }
            texts.generation
        };
        let text = read_project_text(root, path);
        if let Ok(mut texts) = self.texts.lock() {
            let size = text.as_ref().map_or(0, |text| text.len());
            if texts.generation == generation && texts.bytes + size <= MAX_CACHED_TEXT_BYTES {
                texts.bytes += size;
                texts.texts.insert(path.to_owned(), text.clone());
            }
        }
        text
    }
}

/// Indexed files of a project with text access for search and replace.
pub struct ProjectFiles {
    pub root: PathBuf,
    pub index: Arc<FileIndex>,
    cache: Option<Arc<ProjectCache>>,
}

impl ProjectFiles {
    /// Walks and reads from disk every time; used when nothing watches `root`.
    pub fn uncached(root: &Path) -> Result<Self, String> {
        Ok(Self {
            root: root.to_path_buf(),
            index: Arc::new(index::index_at(root)?),
            cache: None,
        })
    }

    #[cfg(test)]
    pub fn cached(root: &Path, cache: Arc<ProjectCache>) -> Result<Self, String> {
        Ok(Self {
            root: root.to_path_buf(),
            index: cache.index(root)?,
            cache: Some(cache),
        })
    }

    /// Text of an indexed file, or `None` if it cannot be read as text.
    pub fn text(&self, path: &str) -> Option<Arc<str>> {
        match &self.cache {
            Some(cache) => cache.text(&self.root, path),
            None => read_project_text(&self.root, path),
        }
    }
}

/// Files of a registered project, cached only while the file watcher keeps
/// the cache current.
pub(super) fn project_files(
    app: &AppHandle,
    root: &str,
    folder: &Path,
) -> Result<ProjectFiles, String> {
    let Some(cache) = app.state::<WatcherState>().cache_for(root) else {
        return ProjectFiles::uncached(folder);
    };
    Ok(ProjectFiles {
        root: folder.to_path_buf(),
        index: cache.index(folder)?,
        cache: Some(cache),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir(root.join("docs")).unwrap();
        fs::write(root.join("docs/a.md"), "first").unwrap();
        (dir, root)
    }

    #[test]
    fn texts_are_reused_until_their_path_changes() {
        let (_dir, root) = project();
        let cache = ProjectCache::default();
        assert_eq!(cache.text(&root, "docs/a.md").as_deref(), Some("first"));
        fs::write(root.join("docs/a.md"), "second").unwrap();
        assert_eq!(cache.text(&root, "docs/a.md").as_deref(), Some("first"));
        cache.forget(&["docs/a.md".into()], false, false);
        assert_eq!(cache.text(&root, "docs/a.md").as_deref(), Some("second"));
        fs::write(root.join("docs/a.md"), "third").unwrap();
        cache.forget(&["docs".into()], true, false);
        assert_eq!(cache.text(&root, "docs/a.md").as_deref(), Some("third"));
        assert_eq!(cache.text(&root, "../outside"), None);
    }

    #[test]
    fn cached_project_files_share_list_and_texts_while_uncached_reads_disk() {
        let (_dir, root) = project();
        let cache = Arc::new(ProjectCache::default());
        let files = ProjectFiles::cached(&root, cache.clone()).unwrap();
        assert_eq!(files.text("docs/a.md").as_deref(), Some("first"));
        fs::write(root.join("docs/a.md"), "second").unwrap();
        let again = ProjectFiles::cached(&root, cache).unwrap();
        assert!(Arc::ptr_eq(&files.index, &again.index));
        assert_eq!(again.text("docs/a.md").as_deref(), Some("first"));
        let uncached = ProjectFiles::uncached(&root).unwrap();
        assert_eq!(uncached.text("docs/a.md").as_deref(), Some("second"));
    }

    #[test]
    fn file_list_is_kept_for_edits_and_dropped_for_structure_changes() {
        let (_dir, root) = project();
        let cache = ProjectCache::default();
        let first = cache.index(&root).unwrap();
        assert_eq!(first.entries.len(), 1);
        fs::write(root.join("docs/b.md"), "new").unwrap();
        cache.forget(&["docs/a.md".into()], false, false);
        assert!(Arc::ptr_eq(&first, &cache.index(&root).unwrap()));
        cache.forget(&["docs/b.md".into()], true, false);
        assert_eq!(cache.index(&root).unwrap().entries.len(), 2);
    }
}
