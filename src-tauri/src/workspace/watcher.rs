use super::*;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::BTreeSet,
    sync::mpsc,
    time::{Duration, Instant},
};
use tauri::Emitter;

/// Event the frontend listens to for external changes in the open project.
pub const CHANGE_EVENT: &str = "workspace-changed";
/// Changes arriving within this window are sent as one batch.
const BATCH_WINDOW: Duration = Duration::from_millis(150);
/// Larger bursts are reported as a rescan instead of a path list.
const MAX_BATCH_PATHS: usize = 1000;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeBatch {
    pub root: String,
    /// Changed paths relative to the project root, `/`-separated.
    pub paths: Vec<String>,
    /// Paths are incomplete; the receiver should re-check everything.
    pub rescan: bool,
}

pub struct WatcherState(pub Mutex<Option<ProjectWatcher>>);
pub struct ProjectWatcher {
    root: String,
    _watcher: RecommendedWatcher,
}

/// Root-relative path of a change, or `None` when it is outside the root or
/// a skipped folder or inside one at any depth. Tools touch these folders
/// constantly (git, builds); a new one is picked up by the focus re-check.
fn relevant_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts = relative.components().peekable();
    parts.peek()?;
    if parts.any(|part| {
        SKIPPED_FOLDERS
            .iter()
            .any(|folder| part.as_os_str() == *folder)
    }) {
        return None;
    }
    Some(relative.to_string_lossy().replace('\\', "/"))
}

#[derive(Default)]
struct Pending {
    paths: BTreeSet<String>,
    rescan: bool,
}

impl Pending {
    fn add(&mut self, root: &Path, event: notify::Result<notify::Event>) {
        let event = match event {
            Ok(event) => event,
            Err(_) => {
                self.rescan = true;
                return;
            }
        };
        if event.need_rescan() {
            self.rescan = true;
        }
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        for path in &event.paths {
            let Some(path) = relevant_path(root, path) else {
                continue;
            };
            if self.paths.len() < MAX_BATCH_PATHS {
                self.paths.insert(path);
            } else {
                self.rescan = true;
            }
        }
    }
}

/// Watches `root` recursively and calls `sink` with batched changes until the
/// returned watcher is dropped.
pub fn watch_folder(
    root: PathBuf,
    sink: impl Fn(Vec<String>, bool) + Send + 'static,
) -> Result<RecommendedWatcher, String> {
    let (sender, receiver) = mpsc::channel();
    let mut watcher =
        notify::recommended_watcher(sender).map_err(|e| format!("변경 감시 시작 실패: {e}"))?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("변경 감시 시작 실패: {e}"))?;
    std::thread::spawn(move || {
        // Ends when the watcher, and with it the sender, is dropped.
        while let Ok(first) = receiver.recv() {
            let mut pending = Pending::default();
            pending.add(&root, first);
            let deadline = Instant::now() + BATCH_WINDOW;
            while let Ok(next) =
                receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
            {
                pending.add(&root, next);
            }
            if pending.rescan || !pending.paths.is_empty() {
                sink(pending.paths.into_iter().collect(), pending.rescan);
            }
        }
    });
    Ok(watcher)
}

/// Starts watching a registered project, replacing any previous watcher.
#[tauri::command]
pub async fn watch_project(app: AppHandle, root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = authorized_root(&app, &root)?;
        let emitter = app.clone();
        let label = root.clone();
        let watcher = watch_folder(folder, move |paths, rescan| {
            let _ = emitter.emit(
                CHANGE_EVENT,
                ChangeBatch {
                    root: label.clone(),
                    paths,
                    rescan,
                },
            );
        })?;
        *app.state::<WatcherState>()
            .0
            .lock()
            .map_err(|e| e.to_string())? = Some(ProjectWatcher {
            root,
            _watcher: watcher,
        });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops watching `root` if it is still the watched project.
#[tauri::command]
pub fn unwatch_project(app: AppHandle, root: String) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    if current.as_ref().is_some_and(|watcher| watcher.root == root) {
        *current = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relevant_paths_are_relative_and_skip_tool_folders() {
        let root = Path::new("/project");
        let check = |path: &str| relevant_path(root, Path::new(path));
        assert_eq!(check("/project/notes/a.md").as_deref(), Some("notes/a.md"));
        assert_eq!(check("/project/.git"), None);
        assert_eq!(check("/project/.git/index"), None);
        assert_eq!(check("/project/node_modules/x/y.js"), None);
        assert_eq!(check("/project/src-tauri/target/debug/x.rlib"), None);
        assert_eq!(check("/project/src-tauri/target"), None);
        assert_eq!(check("/other/a.md"), None);
        assert_eq!(check("/project"), None);
    }

    #[test]
    fn pending_caps_paths_and_flags_errors_as_rescan() {
        let root = Path::new("/project");
        let mut pending = Pending::default();
        let event =
            |path: String| Ok(notify::Event::new(EventKind::Any).add_path(PathBuf::from(path)));
        for index in 0..=MAX_BATCH_PATHS {
            pending.add(root, event(format!("/project/{index}.md")));
        }
        assert_eq!(pending.paths.len(), MAX_BATCH_PATHS);
        assert!(pending.rescan);
        let mut failed = Pending::default();
        failed.add(root, Err(notify::Error::generic("overflow")));
        assert!(failed.rescan);
    }

    #[test]
    fn watcher_reports_created_and_modified_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let (sender, receiver) = mpsc::channel();
        let _watcher = watch_folder(root.clone(), move |paths, rescan| {
            let _ = sender.send((paths, rescan));
        })
        .unwrap();
        fs::create_dir(root.join("notes")).unwrap();
        fs::write(root.join("notes/a.md"), "hello").unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/index"), "ignored").unwrap();
        let mut seen = BTreeSet::new();
        let deadline = Instant::now() + Duration::from_secs(10);
        while !seen.contains("notes/a.md") && Instant::now() < deadline {
            if let Ok((paths, _)) = receiver.recv_timeout(Duration::from_millis(500)) {
                seen.extend(paths);
            }
        }
        assert!(seen.contains("notes/a.md"), "{seen:?}");
        assert!(!seen.contains(".git/index"), "{seen:?}");
    }
}
