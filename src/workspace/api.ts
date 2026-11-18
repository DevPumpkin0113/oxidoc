import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SearchOptions } from "./searchOptions";

export interface Project {
  name: string;
  path: string;
  favorite?: boolean;
  tags?: string[];
  lastOpened?: number;
  status?: "available" | "missing" | "denied" | "unavailable";
  /** The External workspace of files opened through the OS. */
  kind?: "external";
}
export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
  hasChildren?: boolean;
  hasDocuments?: boolean;
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
  /** Highlighted UTF-16 length within `text`. */
  length: number;
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
/** Batched external changes reported by the project file watcher. */
export interface ChangeBatch {
  root: string;
  /** Root-relative, `/`-separated changed paths. */
  paths: string[];
  /** The path list is incomplete; re-check everything. */
  rescan: boolean;
}
export interface AdvancedApi {
  pasteImage: (root: string, data: string) => Promise<Entry>;
  previewReplace: (
    root: string,
    query: string,
    replacement: string,
    options: SearchOptions,
  ) => Promise<{ files: Replacement[]; truncated: boolean; skipped: number }>;
  applyReplace: (
    root: string,
    files: Replacement[],
  ) => Promise<ReplaceResult[]>;
  /** Every Markdown file's text, for updating links after a move. */
  markdownTexts: (root: string) => Promise<{
    files: { path: string; text: string }[];
    truncated: boolean;
    skipped: number;
  }>;
  index: (
    root: string,
  ) => Promise<{ entries: Entry[]; truncated: boolean; skipped: number }>;
  loadRecovery: (root: string) => Promise<RecoveryDocument[]>;
  saveRecovery: (root: string, documents: RecoveryDocument[]) => Promise<void>;
  probe: (
    root: string,
    paths: string[],
  ) => Promise<{ path: string; stamp: string | null }[]>;
  /** Watches a project for external changes; resolves to a stop function. */
  watch?: (
    root: string,
    onChange: (batch: ChangeBatch) => void,
  ) => Promise<() => void>;
  create: (
    root: string,
    parent: string,
    name: string,
    isDirectory: boolean,
  ) => Promise<Entry>;
  rename: (root: string, path: string, name: string) => Promise<Entry>;
  moveFile: (root: string, path: string, parent: string) => Promise<Entry>;
  transfer: (
    root: string,
    path: string,
    parent: string,
    cut: boolean,
    name?: string,
  ) => Promise<Entry>;
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
    options: SearchOptions,
    folder?: string,
  ) => Promise<SearchResults>;
  image: (root: string, path: string) => Promise<string>;
  external: (url: string) => Promise<void>;
}
/** A file the OS asked Oxidoc to open (file association or command line). */
export type LaunchTarget =
  | { kind: "project"; root: string; path: string; name: string }
  /** Outside every project; `path` is the External document id. */
  | { kind: "external"; path: string; name: string };
export interface LaunchApi {
  /** Next waiting request, or null when none is left. */
  take: () => Promise<LaunchTarget | null>;
  /** Registers a folder of the External workspace (its id) as a project. */
  register: (folder: string) => Promise<Project>;
  /** Adds the file a link in an opened External document points to. */
  link: (source: string, target: string) => Promise<LaunchTarget>;
  /** Calls `onRequest` whenever another launch hands over a file. */
  listen: (onRequest: () => void) => Promise<() => void>;
}
export const launchApi: LaunchApi = {
  take: () => invoke("take_launch_request"),
  register: (folder) => invoke("register_external_folder", { folder }),
  link: (source, target) => invoke("open_external_link", { source, target }),
  listen: (onRequest) => listen("launch-request", onRequest),
};
export interface RecoveryDocument {
  path: string;
  content: string;
  savedContent: string;
}
export interface Replacement {
  path: string;
  before: string;
  after: string;
  count: number;
}
export interface ReplaceResult {
  path: string;
  error: string | null;
}

export const workspaceApi: WorkspaceApi = {
  advanced: {
    pasteImage: (root, data) => invoke("save_pasted_image", { root, data }),
    previewReplace: (root, query, replacement, options) =>
      invoke("preview_replace", { root, query, replacement, options }),
    applyReplace: (root, files) => invoke("apply_replace", { root, files }),
    markdownTexts: (root) => invoke("markdown_texts", { root }),
    index: (root) => invoke("index_files", { root }),
    loadRecovery: (root) => invoke("load_recovery", { root }),
    saveRecovery: (root, documents) =>
      invoke("save_recovery", { root, documents }),
    probe: (root, paths) => invoke("probe_entries", { root, paths }),
    watch: async (root, onChange) => {
      const unlisten = await listen<ChangeBatch>(
        "workspace-changed",
        (event) => {
          if (event.payload.root === root) onChange(event.payload);
        },
      );
      try {
        await invoke("watch_project", { root });
      } catch (error) {
        unlisten();
        throw error;
      }
      return () => {
        unlisten();
        void invoke("unwatch_project", { root }).catch(() => {});
      };
    },
    create: (root, parent, name, isDirectory) =>
      invoke("create_entry", { root, parent, name, isDirectory }),
    rename: (root, path, name) => invoke("rename_entry", { root, path, name }),
    moveFile: (root, path, parent) =>
      invoke("move_file", { root, path, parent }),
    transfer: (root, path, parent, cut, name) =>
      invoke("transfer_entry", { root, path, parent, cut, name: name ?? null }),
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
    search: (root, query, options, folder = "") =>
      invoke("search_project", { root, query, options, folder }),
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
