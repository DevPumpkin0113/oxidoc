//! Files opened through the OS: file association, "Open with" or the command line.
//!
//! Only a path the OS handed to this process can be opened or have its folder
//! registered; the frontend never names the file, keeping the registered-path
//! boundary intact.
use super::{Project, advanced, projects, register_folder};
use serde::Serialize;
use std::{
    collections::VecDeque,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

/// Event telling the frontend that a launch request is waiting.
const LAUNCH_EVENT: &str = "launch-request";

#[derive(Default)]
pub struct LaunchState(Mutex<Launch>);

#[derive(Default)]
struct Launch {
    pending: VecDeque<PathBuf>,
    /// Folder of the last request outside every project, which the user may register.
    offered: Option<PathBuf>,
}

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
    /// No registered project contains the file.
    #[serde(rename_all = "camelCase")]
    Outside { folder: String, name: String },
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
        && let Ok(mut launch) = state.0.lock()
    {
        launch.pending.push_back(path);
    }
    let _ = app.emit(LAUNCH_EVENT, ());
}

/// Picks the innermost registered project containing the file.
fn resolve(projects: &[Project], file: &Path) -> Result<(LaunchTarget, Option<PathBuf>), String> {
    let file = fs::canonicalize(file).map_err(|_| "열려는 파일을 찾을 수 없습니다.".to_string())?;
    if !file.is_file() {
        return Err("파일만 열 수 있습니다.".into());
    }
    let name = file
        .file_name()
        .ok_or("파일 이름이 없습니다.")?
        .to_string_lossy()
        .into_owned();
    let owner = projects
        .iter()
        .filter_map(|project| {
            let root = fs::canonicalize(&project.path).ok()?;
            let relative = file.strip_prefix(&root).ok()?.to_owned();
            Some((project, root.components().count(), relative))
        })
        .max_by_key(|(_, depth, _)| *depth);
    if let Some((project, _, relative)) = owner {
        return Ok((
            LaunchTarget::Project {
                root: project.path.clone(),
                path: relative.to_string_lossy().replace('\\', "/"),
                name,
            },
            None,
        ));
    }
    let folder = file.parent().ok_or("상위 폴더가 없습니다.")?.to_owned();
    Ok((
        LaunchTarget::Outside {
            folder: advanced::display_path(&folder),
            name,
        },
        Some(folder),
    ))
}

#[tauri::command]
pub async fn take_launch_request(app: AppHandle) -> Result<Option<LaunchTarget>, String> {
    advanced::io(move || {
        let state = app.state::<LaunchState>();
        let Some(file) = state
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .pending
            .pop_front()
        else {
            return Ok(None);
        };
        let resolved = resolve(&projects(&app)?, &file);
        let mut launch = state.0.lock().map_err(|e| e.to_string())?;
        launch.offered = None;
        let (target, offered) = resolved?;
        launch.offered = offered;
        Ok(Some(target))
    })
    .await
}

/// Registers the folder offered by the last launch request outside every project.
#[tauri::command]
pub async fn register_launch_folder(app: AppHandle) -> Result<Project, String> {
    advanced::io(move || {
        let folder = app
            .state::<LaunchState>()
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .offered
            .take()
            .ok_or("등록할 폴더가 없습니다.")?;
        register_folder(&app, &folder)
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
    fn resolve_prefers_innermost_project_and_offers_outside_folder() {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap();
        fs::create_dir_all(root.join("outer/inner/docs")).unwrap();
        fs::create_dir(root.join("other")).unwrap();
        let file = root.join("outer/inner/docs/a.md");
        fs::write(&file, "# a").unwrap();
        fs::write(root.join("other/b.md"), "# b").unwrap();
        let projects = [
            project(&root.join("outer")),
            project(&root.join("outer/inner")),
        ];

        let (target, offered) = resolve(&projects, &file).unwrap();
        assert_eq!(
            target,
            LaunchTarget::Project {
                root: projects[1].path.clone(),
                path: "docs/a.md".into(),
                name: "a.md".into(),
            }
        );
        assert_eq!(offered, None);

        let (target, offered) = resolve(&projects, &root.join("other/b.md")).unwrap();
        assert!(matches!(target, LaunchTarget::Outside { ref name, .. } if name == "b.md"));
        assert_eq!(offered, Some(root.join("other")));

        assert!(resolve(&projects, &root.join("outer")).is_err());
        assert!(resolve(&projects, &root.join("missing.md")).is_err());
    }
}
