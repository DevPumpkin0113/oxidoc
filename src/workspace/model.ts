export interface Document {
  id: string;
  name: string;
  folder: string;
  content: string;
  savedContent: string;
  diskContent?: string | null;
}
export interface Layout {
  explorerView: "documents" | "all";
  sidebar: boolean;
  activity: "files" | "search" | "projects";
  view: "edit" | "split" | "preview";
  outline: boolean;
  sync: boolean;
}
export const defaultLayout: Layout = {
  explorerView: "documents",
  sidebar: true,
  activity: "files",
  view: "split",
  outline: false,
  sync: true,
};
export interface Session {
  paths: string[];
  activeId: string | null;
  layout: Layout;
}

const MAX_SESSION_DOCUMENTS = 100;
const MAX_PATH_LENGTH = 4096;

export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function parseLayout(value: unknown): Layout {
  const data = record(value);
  return {
    sidebar: typeof data.sidebar === "boolean" ? data.sidebar : true,
    explorerView: data.explorerView === "all" ? "all" : "documents",
    activity: ["files", "search", "projects"].includes(String(data.activity))
      ? (data.activity as Layout["activity"])
      : "files",
    view: ["edit", "split", "preview"].includes(String(data.view))
      ? (data.view as Layout["view"])
      : "split",
    outline: data.outline === true,
    sync: data.sync !== false,
  };
}

export function parseSession(value: unknown, layout: Layout): Session {
  const data = record(value);
  return {
    paths: Array.isArray(data.paths)
      ? data.paths
          .filter(
            (path): path is string =>
              typeof path === "string" && path.length < MAX_PATH_LENGTH,
          )
          .filter(
            (path, index, all) =>
              all.findIndex((candidate) =>
                sameDocumentPath(candidate, path),
              ) === index,
          )
          .slice(0, MAX_SESSION_DOCUMENTS)
      : [],
    activeId: typeof data.activeId === "string" ? data.activeId : null,
    layout: data.layout ? parseLayout(data.layout) : layout,
  };
}

export const isDirty = (document: Document) =>
  document.content !== document.savedContent || document.diskContent === null;

// Windows is the supported desktop target; use the same identity for links,
// explorer paths, save targets and descendant operations.
const pathKey = (path: string) => path.replace(/\\/g, "/").toLowerCase();
export const sameDocumentPath = (a: string, b: string) =>
  pathKey(a) === pathKey(b);
export const isDocumentUnder = (id: string, path: string) =>
  sameDocumentPath(id, path) || pathKey(id).startsWith(pathKey(path) + "/");

export const documentFrom = (path: string, content: string): Document => ({
  id: path,
  name: path.split("/").pop() ?? path,
  folder: path.split("/").slice(0, -1).join("/"),
  content,
  savedContent: content,
});
