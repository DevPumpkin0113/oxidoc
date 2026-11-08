use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
pub fn localized(app: &AppHandle, korean: &str, english: &str) -> String {
    let language = app
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("settings"))
        .and_then(|value| {
            value
                .get("language")
                .and_then(|language| language.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| "system".into());
    let korean_selected = if language == "system" {
        sys_locale::get_locale()
            .unwrap_or_default()
            .to_lowercase()
            .starts_with("ko")
    } else {
        language == "ko"
    };
    if korean_selected {
        korean.into()
    } else {
        english.into()
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    language: String,
    mode: String,
    light_theme: String,
    dark_theme: String,
    ui_font_size: u8,
    editor_font_size: u8,
    preview_font_size: u8,
}
impl Settings {
    fn validate(&self) -> Result<(), String> {
        if !["system", "ko", "en"].contains(&self.language.as_str())
            || !["system", "light", "dark"].contains(&self.mode.as_str())
            || ![
                "light-modern",
                "github-light",
                "one-light",
                "solarized-light",
                "catppuccin-latte",
            ]
            .contains(&self.light_theme.as_str())
            || ![
                "dark-modern",
                "github-dark",
                "one-dark-pro",
                "dracula",
                "catppuccin-mocha",
            ]
            .contains(&self.dark_theme.as_str())
            || !(11..=20).contains(&self.ui_font_size)
            || !(10..=32).contains(&self.editor_font_size)
            || !(12..=32).contains(&self.preview_font_size)
        {
            return Err("유효하지 않은 설정 값입니다.".into());
        }
        Ok(())
    }
}
#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    Ok(store.get("settings").unwrap_or(serde_json::Value::Null))
}
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    settings.validate()?;
    let gate = app.state::<crate::workspace::RegistryGate>();
    let _guard = gate.0.lock().map_err(|e| e.to_string())?;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let before = store.get("settings");
    store.set(
        "settings",
        serde_json::to_value(settings).map_err(|e| e.to_string())?,
    );
    if let Err(error) = store.save() {
        if let Some(before) = before {
            store.set("settings", before);
        } else {
            store.delete("settings");
        }
        return Err(error.to_string());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn valid() -> serde_json::Value {
        serde_json::json!({"language":"system","mode":"system","lightTheme":"light-modern","darkTheme":"dark-modern","uiFontSize":13,"editorFontSize":13,"previewFontSize":15})
    }
    #[test]
    fn accepts_valid_settings_and_rejects_out_of_range_or_unknown_values() {
        assert!(
            serde_json::from_value::<Settings>(valid())
                .unwrap()
                .validate()
                .is_ok()
        );
        for (key, value) in [
            ("language", serde_json::json!("ja")),
            ("lightTheme", serde_json::json!("dracula")),
            ("mode", serde_json::json!("other")),
            ("uiFontSize", serde_json::json!(21)),
            ("editorFontSize", serde_json::json!(9)),
            ("previewFontSize", serde_json::json!(33)),
        ] {
            let mut data = valid();
            data[key] = value;
            assert!(
                serde_json::from_value::<Settings>(data)
                    .unwrap()
                    .validate()
                    .is_err()
            );
        }
    }
    #[test]
    fn rejects_arbitrary_keys_and_invalid_field_types() {
        let mut data = valid();
        data["path"] = serde_json::json!("outside.json");
        assert!(serde_json::from_value::<Settings>(data).is_err());
        let mut data = valid();
        data["editorFontSize"] = serde_json::json!("24");
        assert!(serde_json::from_value::<Settings>(data).is_err());
    }
}
