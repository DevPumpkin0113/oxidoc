use super::{Entry, fs};
use std::path::Path;

const MAX_VISIBILITY_ENTRIES: usize = 20_000;
const MAX_VISIBILITY_DEPTH: usize = 64;

fn inspect(
    root: &Path,
    directory: &Path,
    budget: &mut usize,
    depth: usize,
) -> (Option<bool>, Option<bool>) {
    if depth > MAX_VISIBILITY_DEPTH {
        return (None, None);
    }
    let Ok(items) = fs::read_dir(directory) else {
        return (None, None);
    };
    let mut children = false;
    let mut uncertain = false;
    for item in items {
        if *budget == 0 {
            return (if children { Some(true) } else { None }, None);
        }
        *budget -= 1;
        let Ok(item) = item else {
            uncertain = true;
            continue;
        };
        let Ok(kind) = item.file_type() else {
            uncertain = true;
            continue;
        };
        if kind.is_symlink() || (!kind.is_dir() && !kind.is_file()) {
            continue;
        }
        let Ok(path) = fs::canonicalize(item.path()) else {
            uncertain = true;
            continue;
        };
        if !path.starts_with(root) {
            continue;
        }
        children = true;
        if kind.is_file()
            && path.extension().is_some_and(|extension| {
                ["md", "mmd", "mermaid"]
                    .iter()
                    .any(|candidate| extension.to_string_lossy().eq_ignore_ascii_case(candidate))
            })
        {
            return (Some(true), Some(true));
        }
        if kind.is_dir() {
            match inspect(root, &path, budget, depth + 1).1 {
                Some(true) => return (Some(true), Some(true)),
                None => uncertain = true,
                _ => {}
            }
        }
    }
    (
        if children {
            Some(true)
        } else if uncertain {
            None
        } else {
            Some(false)
        },
        if uncertain { None } else { Some(false) },
    )
}

pub(super) fn populate(root: &Path, entries: &mut [Entry]) {
    let mut budget = MAX_VISIBILITY_ENTRIES;
    for entry in entries.iter_mut().filter(|entry| entry.is_directory) {
        let (children, documents) = inspect(root, &root.join(&entry.path), &mut budget, 0);
        entry.has_children = children;
        entry.has_documents = documents;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nested_documents_and_actual_empty_folders_are_distinguished() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("docs/nested")).unwrap();
        fs::create_dir_all(root.join("empty")).unwrap();
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::create_dir_all(root.join("empty-chain/child")).unwrap();
        fs::write(root.join("docs/nested/flow.MMD"), "graph LR; A-->B").unwrap();
        fs::write(root.join("assets/image.png"), b"image").unwrap();
        let entries = super::super::directory_entries(&root, "").unwrap();
        let entry = |name| entries.iter().find(|entry| entry.name == name).unwrap();
        assert_eq!(entry("docs").has_documents, Some(true));
        assert_eq!(entry("empty").has_children, Some(false));
        assert_eq!(entry("assets").has_documents, Some(false));
        assert_eq!(entry("assets").has_children, Some(true));
        assert_eq!(entry("empty-chain").has_documents, Some(false));
        assert_eq!(entry("empty-chain").has_children, Some(true));
    }
    #[test]
    fn exhausted_budget_never_claims_a_folder_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "a").unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        assert_eq!(inspect(&root, &root, &mut 0, 0), (None, None));
    }
}
