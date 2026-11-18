use tauri::Manager;

#[derive(serde::Serialize)]
struct RuntimeInfo {
    version: &'static str,
    platform: &'static str,
    locale: String,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        locale: sys_locale::get_locale().unwrap_or_else(|| "en".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch hands its file to this
        // window instead of starting another process on the same app data.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(path) = workspace::launch_path(args, std::path::Path::new(&cwd)) {
                workspace::queue_launch(app, path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(workspace::RegistryGate(std::sync::Mutex::new(())))
        .manage(workspace::WatcherState(std::sync::Mutex::new(None)))
        .manage(workspace::LaunchState::default())
        .setup(|app| {
            let cwd = std::env::current_dir().unwrap_or_default();
            if let Some(path) = workspace::launch_path(std::env::args_os(), &cwd) {
                workspace::queue_launch(app.handle(), path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            settings::load_settings,
            settings::save_settings,
            fonts::system_fonts,
            workspace::list_projects,
            workspace::pick_project,
            workspace::list_entries,
            workspace::read_document,
            workspace::save_document,
            workspace::create_entry,
            workspace::rename_entry,
            workspace::move_file,
            workspace::transfer_entry,
            workspace::probe_entries,
            workspace::watch_project,
            workspace::unwatch_project,
            workspace::index_files,
            workspace::save_pasted_image,
            workspace::preview_replace,
            workspace::apply_replace,
            workspace::markdown_texts,
            workspace::load_recovery,
            workspace::save_recovery,
            workspace::entry_path,
            workspace::open_in_explorer,
            workspace::delete_entry,
            workspace::pick_save_path,
            workspace::target_content,
            workspace::save_document_as,
            workspace::update_project,
            workspace::remove_project,
            workspace::relocate_project,
            workspace::load_workspace_state,
            workspace::load_session,
            workspace::save_session,
            workspace::search_project,
            workspace::read_image,
            workspace::open_external,
            workspace::take_launch_request,
            workspace::register_launch_folder
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Oxidoc");
}
mod fonts;
mod settings;
#[cfg(test)]
mod updater_tests;
mod workspace;
