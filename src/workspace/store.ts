import { create } from "zustand";
import { workspaceApi, type WorkspaceApi } from "./api";
import { defaultLayout } from "./model";
import { attachPersistence } from "./persistence";
import { createDocumentSlice } from "./slices/documentSlice";
import { createFileSlice } from "./slices/fileSlice";
import { createProjectSlice } from "./slices/projectSlice";
import { createRecoverySlice } from "./slices/recoverySlice";
import type {
  BaseSlice,
  Runtime,
  SliceContext,
  WorkspaceState,
} from "./slices/types";

export {
  clampSidebarWidth,
  defaultLayout,
  SIDEBAR_WIDTH,
  isDirty,
  isDocumentUnder,
  EXTERNAL_PROJECT,
  isExternal,
  parseLayout,
  shortPath,
  sameDocumentPath,
  type Document,
  type Layout,
} from "./model";
export type { WorkspaceState } from "./slices/types";

/** Workspace store composed from feature slices; `api` is injectable for tests. */
export function createWorkspaceStore(api: WorkspaceApi = workspaceApi) {
  const runtime: Runtime = {
    expanding: new Map(),
    persistQueue: Promise.resolve(),
    recoveryQueue: Promise.resolve(),
  };
  const store = create<WorkspaceState>((set, get) => {
    const context: SliceContext = { set, get, api, runtime };
    const base: BaseSlice = {
      initialized: false,
      desktop: false,
      busy: false,
      error: "",
      generation: 0,
      layout: { ...defaultLayout },
      clearError: () => set({ error: "" }),
      setLayout: (patch) =>
        set((state) => ({ layout: { ...state.layout, ...patch } })),
    };
    return {
      ...base,
      ...createProjectSlice(context),
      ...createDocumentSlice(context),
      ...createFileSlice(context),
      ...createRecoverySlice(context),
    };
  });
  if (api.advanced) attachPersistence(store, runtime);
  return store;
}

export const useWorkspace = createWorkspaceStore();
