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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(workspace::RegistryGate(std::sync::Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            settings::load_settings,
            settings::save_settings,
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
            workspace::index_files,
            workspace::save_pasted_image,
            workspace::preview_replace,
            workspace::apply_replace,
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
            workspace::open_external
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Oxidoc");
}
mod settings;
mod workspace;
