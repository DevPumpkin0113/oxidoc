import type { Entry } from "./api";
export const isMermaidFile = (name: string) => /\.(mmd|mermaid)$/i.test(name);
export const isDocumentFile = (name: string) =>
  /\.(md|mmd|mermaid)$/i.test(name);

export function visibleEntries(
  entries: Entry[],
  tree: Record<string, Entry[]>,
  view: "documents" | "all",
) {
  if (view === "all") return entries;
  const hasDocuments = (entry: Entry, visited = new Set<string>()): boolean => {
    if (!entry.isDirectory) return isDocumentFile(entry.name);
    if (typeof entry.hasDocuments === "boolean") return entry.hasDocuments;
    if (visited.has(entry.path)) return false;
    const children = tree[entry.path];
    if (!children) return true;
    const next = new Set(visited).add(entry.path);
    return children.some((child) => hasDocuments(child, next));
  };
  return entries.filter((entry) => hasDocuments(entry));
}
