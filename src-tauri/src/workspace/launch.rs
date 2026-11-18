//! Files opened through the OS: file association, "Open with" or the command line.
//!
//! Files outside every registered project open in the External workspace
//! (`EXTERNAL_ROOT`). Its documents are identified by absolute paths, and only
//! the files the OS handed to this process (plus raster images under their
//! folders, for the preview) can be accessed. The frontend never adds paths,
//! keeping the registered-path boundary intact.
use super::{Project, advanced, projects, register_folder};
use serde::Serialize;
use std::{
    collections::{BTreeSet, VecDeque},
    ffi::OsString,
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

/// Event telling the frontend that a launch request is waiting.
const LAUNCH_EVENT: &str = "launch-request";
/// Root of the External workspace; never a valid folder path.
pub const EXTERNAL_ROOT: &str = "external:";

#[derive(Default)]
pub struct LaunchState(Mutex<VecDeque<PathBuf>>);

/// Canonical files opened through the OS outside every project, for this run.
#[derive(Default)]
pub struct ExternalFiles(Mutex<BTreeSet<PathBuf>>);

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LaunchTarget {
    /// The file belongs to a registered project; `path` is root-relative.
    #[serde(rename_all = "camelCase")]
    Project {
        root: String,
        path: String,
        name: String,
    },
    /// No registered project contains the file; `path` is its External id.
    #[serde(rename_all = "camelCase")]
    External { path: String, name: String },
}

/// The first non-flag argument after the executable, resolved against `cwd`.
pub fn launch_path<I, S>(args: I, cwd: &Path) -> Option<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    args.into_iter()
        .skip(1)
        .map(Into::into)
        .find(|arg| !arg.is_empty() && !arg.to_string_lossy().starts_with('-'))
        .map(|arg| cwd.join(arg))
}

/// Queues a launched path and wakes the frontend.
pub fn queue_launch(app: &AppHandle, path: PathBuf) {
    if let Some(state) = app.try_state::<LaunchState>()
        && let Ok(mut pending) = state.0.lock()
    {
        pending.push_back(path);
    }
    let _ = app.emit(LAUNCH_EVENT, ());
}

/// The External id of a path: its display form with `/` separators.
pub(super) fn external_id(path: &Path) -> String {
    advanced::display_path(path).replace('\\', "/")
}

/// Resolves an External id to a canonical absolute path.
pub(super) fn external_path(id: &str) -> Result<PathBuf, String> {
    let path = Path::new(id);
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return Err("프로젝트 외부 경로에는 접근할 수 없습니다.".into());
    }
    fs::canonicalize(path).map_err(|e| {
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        super::access_error(&e, &name)
    })
}

/// Files opened in the External workspace during this run.
pub(super) fn external_files(app: &AppHandle) -> BTreeSet<PathBuf> {
    app.try_state::<ExternalFiles>()
        .and_then(|state| state.0.lock().ok().map(|files| files.clone()))
        .unwrap_or_default()
}

/// Folders holding External files, which list and preview their contents.
pub(super) fn external_folders(files: &BTreeSet<PathBuf>) -> BTreeSet<PathBuf> {
    files
        .iter()
        .filter_map(|file| file.parent().map(Path::to_path_buf))
        .collect()
}

/// Picks the innermost registered project containing the file, if any.
fn resolve(projects: &[Project], file: &Path) -> Result<Result<LaunchTarget, PathBuf>, String> {
    let file = fs::canonicalize(file).map_err(|_| "열려는 파일을 찾을 수 없습니다.".to_string())?;
    if !file.is_file() {
        return Err("파일만 열 수 있습니다.".into());
    }
    let owner = projects
        .iter()
        .filter_map(|project| {
            let root = fs::canonicalize(&project.path).ok()?;
            let relative = file.strip_prefix(&root).ok()?.to_owned();
            Some((project, root.components().count(), relative))
        })
        .max_by_key(|(_, depth, _)| *depth);
    Ok(match owner {
        Some((project, _, relative)) => Ok(LaunchTarget::Project {
            root: project.path.clone(),
            path: relative.to_string_lossy().replace('\\', "/"),
            name: file_name(&file),
        }),
        None => Err(file),
    })
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Adds a canonical file to the External workspace.
fn grant(files: &ExternalFiles, file: PathBuf) -> Result<LaunchTarget, String> {
    let target = LaunchTarget::External {
        path: external_id(&file),
        name: file_name(&file),
    };
    files.0.lock().map_err(|e| e.to_string())?.insert(file);
    Ok(target)
}

#[tauri::command]
pub async fn take_launch_request(app: AppHandle) -> Result<Option<LaunchTarget>, String> {
    advanced::io(move || {
        let Some(file) = app
            .state::<LaunchState>()
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .pop_front()
        else {
            return Ok(None);
        };
        match resolve(&projects(&app)?, &file)? {
            Ok(target) => Ok(Some(target)),
            Err(file) => grant(&app.state::<ExternalFiles>(), file).map(Some),
        }
    })
    .await
}

/// The file a link in an opened External document points to.
fn external_link(files: &BTreeSet<PathBuf>, source: &str, target: &str) -> Result<PathBuf, String> {
    if !files.contains(&external_path(source)?) {
        return Err(super::unregistered_file(Path::new(source)));
    }
    external_path(target)
}

/// The file a link in a project document points to. `target` is relative to
/// the project root and may leave it through `..`.
fn project_link(root: &Path, source: &str, target: &str) -> Result<PathBuf, String> {
    super::contained_path(root, source)?;
    if Path::new(target)
        .components()
        .any(|part| !matches!(part, Component::Normal(_) | Component::ParentDir))
    {
        return Err("지원하지 않는 링크입니다.".into());
    }
    let name = file_name(Path::new(target));
    fs::canonicalize(root.join(target)).map_err(|e| super::access_error(&e, &name))
}

/// The workspace and document a link in `source`, a document of `root`,
/// opens: the innermost project holding the target, otherwise External (the
/// target is added to it). Following a link is the user's choice, as with
/// opening a file from the OS.
#[tauri::command]
pub async fn follow_link(
    app: AppHandle,
    root: String,
    source: String,
    target: String,
) -> Result<LaunchTarget, String> {
    advanced::io(move || {
        let file = if root == EXTERNAL_ROOT {
            external_link(&external_files(&app), &source, &target)?
        } else {
            project_link(&super::authorized_root(&app, &root)?, &source, &target)?
        };
        match resolve(&projects(&app)?, &file)? {
            Ok(target) => Ok(target),
            Err(file) => grant(&app.state::<ExternalFiles>(), file),
        }
    })
    .await
}

/// Registers a folder of the External workspace as a project.
#[tauri::command]
pub async fn register_external_folder(app: AppHandle, folder: String) -> Result<Project, String> {
    advanced::io(move || {
        let folder = external_path(&folder)?;
        if !external_folders(&external_files(&app)).contains(&folder) {
            return Err("등록할 폴더가 없습니다.".into());
        }
        let project = register_folder(&app, &folder)?;
        // The folder's files now open in its project tab instead.
        app.state::<ExternalFiles>()
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .retain(|file| !file.starts_with(&folder));
        Ok(project)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(path: &Path) -> Project {
        Project {
            name: "p".into(),
            path: path.to_string_lossy().into_owned(),
            ..Project::default()
        }
    }

    #[test]
    fn launch_path_skips_executable_and_flags() {
        let cwd = Path::new("C:/work");
        assert_eq!(launch_path(["oxidoc.exe"], cwd), None);
        assert_eq!(
            launch_path(["oxidoc.exe", "--flag", "notes/a.md"], cwd),
            Some(cwd.join("notes/a.md"))
        );
        let absolute = std::env::temp_dir().join("a.md");
        assert_eq!(
            launch_path([OsString::from("oxidoc.exe"), absolute.clone().into()], cwd),
            Some(absolute)
        );
    }

    #[test]
    fn resolve_prefers_innermost_project_and_collects_outside_files() {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap();
        fs::create_dir_all(root.join("outer/inner/docs")).unwrap();
        fs::create_dir(root.join("one")).unwrap();
        fs::create_dir(root.join("two")).unwrap();
        let file = root.join("outer/inner/docs/a.md");
        fs::write(&file, "# a").unwrap();
        for path in ["one/b.md", "one/c.md", "two/d.md"] {
            fs::write(root.join(path), "#").unwrap();
        }
        let projects = [
            project(&root.join("outer")),
            project(&root.join("outer/inner")),
        ];

        assert_eq!(
            resolve(&projects, &file).unwrap(),
            Ok(LaunchTarget::Project {
                root: projects[1].path.clone(),
                path: "docs/a.md".into(),
                name: "a.md".into(),
            })
        );

        let files = ExternalFiles::default();
        for path in ["one/b.md", "two/d.md", "one/c.md", "one/b.md"] {
            let outside = resolve(&projects, &root.join(path)).unwrap().unwrap_err();
            let target = grant(&files, outside).unwrap();
            let LaunchTarget::External { path: id, .. } = target else {
                panic!("expected an External target");
            };
            assert_eq!(external_path(&id).unwrap(), root.join(path));
        }
        let granted = files.0.lock().unwrap().clone();
        assert_eq!(granted.len(), 3);
        assert_eq!(
            external_folders(&granted),
            BTreeSet::from([root.join("one"), root.join("two")])
        );

        assert!(resolve(&projects, &root.join("outer")).is_err());
        assert!(resolve(&projects, &root.join("missing.md")).is_err());
        assert!(external_path("one/b.md").is_err());
        assert!(external_path(&format!("{}/one/../two/d.md", external_id(&root))).is_err());
    }

    #[test]
    fn external_links_need_an_opened_source() {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap();
        fs::create_dir(root.join("docs")).unwrap();
        fs::write(root.join("readme.md"), "#").unwrap();
        fs::write(root.join("docs/notes.md"), "#").unwrap();
        let id = |path: &str| external_id(&root.join(path));
        let files = BTreeSet::from([root.join("readme.md")]);

        assert_eq!(
            external_link(&files, &id("readme.md"), &id("docs/notes.md")).unwrap(),
            root.join("docs/notes.md")
        );
        assert_eq!(
            external_link(&files, &id("readme.md"), &id("missing.md")).unwrap_err(),
            "파일을 찾을 수 없습니다: missing.md"
        );
        // Only an opened document can grant its links.
        assert!(external_link(&files, &id("docs/notes.md"), &id("readme.md")).is_err());
    }

    #[test]
    fn project_links_may_leave_the_root_but_name_missing_files() {
        let directory = tempfile::tempdir().unwrap();
        let base = fs::canonicalize(directory.path()).unwrap();
        fs::create_dir_all(base.join("project/docs")).unwrap();
        fs::create_dir(base.join("other")).unwrap();
        fs::write(base.join("project/docs/a.md"), "#").unwrap();
        fs::write(base.join("other/b.md"), "#").unwrap();
        let root = base.join("project");

        assert_eq!(
            project_link(&root, "docs/a.md", "../other/b.md").unwrap(),
            base.join("other/b.md")
        );
        assert_eq!(
            project_link(&root, "docs/a.md", "../other/missing.md").unwrap_err(),
            "파일을 찾을 수 없습니다: missing.md"
        );
        assert!(project_link(&root, "docs/a.md", "C:/other/b.md").is_err());
        assert!(project_link(&root, "../other/b.md", "docs/a.md").is_err());
        // A folder target resolves but is not a file to open.
        let other = project_link(&root, "docs/a.md", "../other").unwrap();
        assert!(resolve(&[], &other).is_err());
    }
}
