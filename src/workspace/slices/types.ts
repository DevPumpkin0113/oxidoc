import type { StoreApi } from "zustand";
import type {
  Entry,
  Project,
  ProjectPatch,
  RecoveryDocument,
  Replacement,
  ReplaceResult,
  WorkspaceApi,
} from "../api";
import type { Document, Layout, Session } from "../model";

export interface BaseSlice {
  initialized: boolean;
  desktop: boolean;
  busy: boolean;
  error: string;
  /** Bumped when paths or the project change; stale async results are dropped. */
  generation: number;
  layout: Layout;
  clearError: () => void;
  setLayout: (patch: Partial<Layout>) => void;
}

/** A project tab's state, kept in memory while another tab is shown. */
export interface ParkedWorkspace {
  project: Project;
  documents: Document[];
  activeId: string | null;
  tree: Record<string, Entry[]>;
  layout: Layout;
  recoveryCandidates: RecoveryDocument[];
  recoveryError: string;
  recoveryReady: boolean;
}

export interface ProjectSlice {
  projects: Project[];
  project: Project | null;
  sessions: Record<string, Session>;
  /** Project tabs at the bottom of the window, in order; includes `project`. */
  openProjects: Project[];
  /** Tabs other than the active one, by project path. */
  parked: Record<string, ParkedWorkspace>;
  /** `start` (registered or single-file) replaces the last-used project on startup. */
  initialize: (desktop: boolean, start?: Project) => Promise<void>;
  choose: () => Promise<Project | null>;
  /** Shows a project tab, opening it when needed; the current tab is kept. */
  activate: (project: Project) => Promise<boolean>;
  persist: () => Promise<void>;
  /** Closes a project tab whose unsaved edits were already settled. */
  closeProject: (path: string) => Promise<void>;
  moveProject: (path: string, index: number) => void;
  /** Saves the unsaved documents of a background tab. */
  saveParked: (path: string) => Promise<boolean>;
  /** Drops the recovery snapshot of a background tab's discarded edits. */
  discardParked: (path: string) => Promise<void>;
  updateProject: (path: string, patch: ProjectPatch) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  relocateProject: (path: string) => Promise<void>;
}

export interface DocumentSlice {
  documents: Document[];
  activeId: string | null;
  closedEntries: Record<string, Entry[]>;
  open: (entry: Entry) => Promise<void>;
  edit: (id: string, content: string) => void;
  save: (id: string) => Promise<boolean>;
  saveAs: (id: string) => Promise<boolean>;
  close: (id: string) => void;
  /** Moves an open document to `index` in the tab order. */
  moveDocument: (id: string, index: number) => void;
  reopenClosed: () => Promise<void>;
  noticeExternal: (id: string, content: string | null) => void;
  resolveExternal: (id: string, reload: boolean) => void;
  applyReplacements: (files: Replacement[]) => Promise<ReplaceResult[]>;
}

export interface FileSlice {
  tree: Record<string, Entry[]>;
  clipboard: { root: string; entry: Entry; cut: boolean } | null;
  expand: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  copyEntry: (entry: Entry, cut: boolean) => void;
  pasteEntry: (parent: string, name?: string) => Promise<boolean>;
  createEntry: (
    parent: string,
    name: string,
    directory: boolean,
  ) => Promise<void>;
  renameEntry: (path: string, name: string) => Promise<boolean>;
  moveFile: (path: string, parent: string) => Promise<boolean>;
  trashEntry: (path: string) => Promise<void>;
}

export interface RecoverySlice {
  recoveryCandidates: RecoveryDocument[];
  recoveryError: string;
  recoveryReady: boolean;
  decideRecovery: (restore: boolean) => Promise<void>;
  flushRecovery: (clear?: boolean) => Promise<void>;
}

export type WorkspaceState = BaseSlice &
  ProjectSlice &
  DocumentSlice &
  FileSlice &
  RecoverySlice;

/** Mutable per-store state shared by slices and persistence subscriptions. */
export interface Runtime {
  /** In-flight folder loads keyed by generation and path. */
  expanding: Map<string, Promise<void>>;
  persistQueue: Promise<void>;
  recoveryQueue: Promise<void>;
  recoveryTimer?: ReturnType<typeof setTimeout>;
}

export interface SliceContext {
  set: StoreApi<WorkspaceState>["setState"];
  get: StoreApi<WorkspaceState>["getState"];
  api: WorkspaceApi;
  runtime: Runtime;
}
