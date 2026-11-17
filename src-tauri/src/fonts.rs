//! Installed font families for the editor font picker.
use serde::Serialize;
use std::{collections::BTreeMap, sync::OnceLock};

#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontFamily {
    /// Name to use in CSS (the font's English family name when it has one).
    name: String,
    /// Other names of the family, such as a Korean one, for search.
    aliases: Vec<String>,
    monospace: bool,
}

/// Families from `(names, monospace)` faces: merged by first name,
/// monospace first, then by name.
fn families(faces: impl IntoIterator<Item = (Vec<String>, bool)>) -> Vec<FontFamily> {
    let mut merged: BTreeMap<String, FontFamily> = BTreeMap::new();
    for (names, monospace) in faces {
        let Some(name) = names.first().filter(|name| !name.trim().is_empty()) else {
            continue;
        };
        let family = merged
            .entry(name.to_lowercase())
            .or_insert_with(|| FontFamily {
                name: name.clone(),
                aliases: Vec::new(),
                monospace,
            });
        family.monospace |= monospace;
        for alias in &names[1..] {
            if alias != &family.name && !family.aliases.contains(alias) {
                family.aliases.push(alias.clone());
            }
        }
    }
    let mut list: Vec<_> = merged.into_values().collect();
    list.sort_by(|a, b| {
        b.monospace
            .cmp(&a.monospace)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    list
}

/// Installed families, read once: scanning every font file takes a moment.
#[tauri::command]
pub async fn system_fonts() -> Result<Vec<FontFamily>, String> {
    static FONTS: OnceLock<Vec<FontFamily>> = OnceLock::new();
    if let Some(fonts) = FONTS.get() {
        return Ok(fonts.clone());
    }
    let fonts = tauri::async_runtime::spawn_blocking(|| {
        let mut database = fontdb::Database::new();
        database.load_system_fonts();
        families(database.faces().map(|face| {
            (
                face.families.iter().map(|(name, _)| name.clone()).collect(),
                face.monospaced,
            )
        }))
    })
    .await
    .map_err(|error| error.to_string())?;
    Ok(FONTS.get_or_init(|| fonts).clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_faces_into_families_with_monospace_first() {
        let names = |list: &[&str]| list.iter().map(|name| name.to_string()).collect();
        let list = families([
            (names(&["Malgun Gothic", "맑은 고딕"]), false),
            (names(&["Consolas"]), true),
            (names(&["Malgun Gothic", "맑은 고딕"]), false),
            (names(&["D2Coding", "D2Coding"]), false),
            (names(&["d2coding"]), true),
            (names(&[" "]), true),
            (Vec::new(), false),
            (names(&["Arial"]), false),
        ]);
        assert_eq!(
            list.iter()
                .map(|family| (family.name.as_str(), family.monospace))
                .collect::<Vec<_>>(),
            [
                ("Consolas", true),
                ("D2Coding", true),
                ("Arial", false),
                ("Malgun Gothic", false)
            ]
        );
        assert_eq!(list[3].aliases, ["맑은 고딕"]);
        assert!(list[1].aliases.is_empty());
    }
}
