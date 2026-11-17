/** Drag data type of a document tab being reordered. */
export const TAB_DRAG_TYPE = "application/x-oxidoc-tab";

interface TabDocument {
  id: string;
  name: string;
  folder: string;
}

/**
 * Folder hints for tabs whose names collide, keyed by document id: the
 * shortest folder suffix that tells the documents apart (VS Code style).
 * Documents with unique names get no hint.
 */
export function tabHints(documents: TabDocument[]) {
  const hints = new Map<string, string>();
  const groups = new Map<string, TabDocument[]>();
  for (const document of documents) {
    const key = document.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), document]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const parts = group.map((document) =>
      document.folder ? document.folder.split("/") : [],
    );
    const longest = Math.max(...parts.map((segments) => segments.length));
    group.forEach((document, index) => {
      const own = parts[index];
      let hint = own.join("/");
      for (let size = 1; size <= longest; size++) {
        const suffix = own.slice(-size).join("/");
        const unique = parts.every(
          (other, otherIndex) =>
            otherIndex === index ||
            other.slice(-size).join("/").toLowerCase() !== suffix.toLowerCase(),
        );
        if (unique) {
          hint = suffix;
          break;
        }
      }
      hints.set(document.id, hint || ".");
    });
  }
  return hints;
}

/**
 * Index for `moveDocument` when `dragged` is dropped before or after
 * `target`, counted in the order without the dragged tab.
 */
export function dropIndex(
  ids: string[],
  dragged: string,
  target: string,
  after: boolean,
) {
  const rest = ids.filter((id) => id !== dragged);
  const index = rest.indexOf(target);
  if (index < 0) return rest.length;
  return after ? index + 1 : index;
}
