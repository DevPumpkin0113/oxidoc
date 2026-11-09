import { invoke } from "@tauri-apps/api/core";

export interface Project {
  name: string;
  path: string;
  favorite?: boolean;
  tags?: string[];
  lastOpened?: number;
  status?: "available" | "missing" | "denied" | "unavailable";
}
export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
}
export interface WorkspaceApi {
  advanced?: AdvancedApi;
  projects: () => Promise<Project[]>;
  pick: () => Promise<Project | null>;
  entries: (root: string, path: string) => Promise<Entry[]>;
  read: (root: string, path: string) => Promise<string>;
  save: (
    root: string,
    path: string,
    content: string,
    expected: string,
  ) => Promise<void>;
}
export interface SearchMatch {
  path: string;
  name: string;
  line: number;
  column: number;
  text: string;
}
export interface SearchResults {
  matches: SearchMatch[];
  truncated: boolean;
  skipped: number;
}
export interface ProjectPatch {
  name?: string;
  favorite?: boolean;
  tags?: string[];
  touch?: boolean;
}
export interface AdvancedApi {
  create: (
    root: string,
    parent: string,
    name: string,
    isDirectory: boolean,
  ) => Promise<Entry>;
  rename: (root: string, path: string, name: string) => Promise<Entry>;
  moveFile: (root: string, path: string, parent: string) => Promise<Entry>;
  entryPath: (root: string, path: string) => Promise<string>;
  explorer: (root: string, path: string) => Promise<void>;
  trash: (root: string, path: string) => Promise<void>;
  pickSave: (root: string, path: string) => Promise<string | null>;
  target: (root: string, path: string) => Promise<string | null>;
  saveAs: (
    root: string,
    path: string,
    content: string,
    expected: string | null,
  ) => Promise<void>;
  update: (path: string, patch: ProjectPatch) => Promise<Project[]>;
  remove: (path: string) => Promise<Project[]>;
  relocate: (path: string) => Promise<Project[] | null>;
  loadApp: () => Promise<unknown>;
  loadSession: (root: string) => Promise<unknown>;
  saveSession: (
    root: string,
    session: unknown,
    layout: unknown,
  ) => Promise<void>;
  search: (
    root: string,
    query: string,
    caseSensitive: boolean,
    folder?: string,
  ) => Promise<SearchResults>;
  image: (root: string, path: string) => Promise<string>;
  external: (url: string) => Promise<void>;
}

export const workspaceApi: WorkspaceApi = {
  advanced: {
    create: (root, parent, name, isDirectory) =>
      invoke("create_entry", { root, parent, name, isDirectory }),
    rename: (root, path, name) => invoke("rename_entry", { root, path, name }),
    moveFile: (root, path, parent) =>
      invoke("move_file", { root, path, parent }),
    entryPath: (root, path) => invoke("entry_path", { root, path }),
    explorer: (root, path) => invoke("open_in_explorer", { root, path }),
    trash: (root, path) => invoke("delete_entry", { root, path }),
    pickSave: (root, path) => invoke("pick_save_path", { root, path }),
    target: (root, path) => invoke("target_content", { root, path }),
    saveAs: (root, path, content, expected) =>
      invoke("save_document_as", { root, path, content, expected }),
    update: (path, patch) => invoke("update_project", { path, patch }),
    remove: (path) => invoke("remove_project", { path }),
    relocate: (path) => invoke("relocate_project", { path }),
    loadApp: () => invoke("load_workspace_state"),
    loadSession: (root) => invoke("load_session", { root }),
    saveSession: (root, session, layout) =>
      invoke("save_session", { root, session, layout }),
    search: (root, query, caseSensitive, folder = "") =>
      invoke("search_project", { root, query, caseSensitive, folder }),
    image: (root, path) => invoke("read_image", { root, path }),
    external: (url) => invoke("open_external", { url }),
  },
  projects: () => invoke("list_projects"),
  pick: () => invoke("pick_project"),
  entries: (root, path) => invoke("list_entries", { root, path }),
  read: (root, path) => invoke("read_document", { root, path }),
  save: (root, path, content, expected) =>
    invoke("save_document", { root, path, content, expected }),
};
