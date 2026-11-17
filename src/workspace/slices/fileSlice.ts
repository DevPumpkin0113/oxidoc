import type { Entry } from "../api";
import { documentFrom, isDocumentUnder, sameDocumentPath } from "../model";
import type { FileSlice, SliceContext, WorkspaceState } from "./types";

/** State after `from` (a file or folder) moved to `to`, keeping open buffers. */
function movedState(state: WorkspaceState, from: string, to: string) {
  const remap = (id: string) =>
    isDocumentUnder(id, from) ? to + id.slice(from.length) : id;
  return {
    documents: state.documents.map((document) =>
      isDocumentUnder(document.id, from)
        ? {
            ...document,
            ...documentFrom(remap(document.id), document.content),
            savedContent: document.savedContent,
          }
        : document,
    ),
    activeId: state.activeId ? remap(state.activeId) : null,
    tree: Object.fromEntries(
      Object.entries(state.tree).map(([key, entries]) => [remap(key), entries]),
    ),
    generation: state.generation + 1,
  };
}

const OPEN_TARGET_ERROR =
  "대상 경로의 문서가 이미 열려 있습니다. 먼저 닫아 주세요.";

export function createFileSlice({
  set,
  get,
  api,
  runtime,
}: SliceContext): FileSlice {
  /** Runs a desktop file operation with busy/error handling. */
  async function operate<T>(fallback: T, run: () => Promise<T>): Promise<T> {
    set({ busy: true, error: "" });
    try {
      return await run();
    } catch (error) {
      set({ error: String(error) });
      return fallback;
    } finally {
      set({ busy: false });
    }
  }
  const ready = () => {
    const { project, desktop, busy } = get();
    return project && desktop && !busy && api.advanced
      ? { root: project.path, advanced: api.advanced }
      : null;
  };

  return {
    tree: {},
    clipboard: null,
    expand: (path) => {
      const { project, tree, desktop, generation } = get();
      if (!desktop || !project || tree[path]) return Promise.resolve();
      const key = `${generation}\u0000${path}`;
      const pending = runtime.expanding.get(key);
      if (pending) return pending;
      const task = (async () => {
        try {
          const entries = await api.entries(project.path, path);
          if (get().generation === generation)
            set((state) => ({ tree: { ...state.tree, [path]: entries } }));
        } catch (error) {
          if (get().generation === generation) set({ error: String(error) });
        }
      })().finally(() => runtime.expanding.delete(key));
      runtime.expanding.set(key, task);
      return task;
    },
    refresh: async () => {
      const { project, desktop, tree, generation } = get();
      if (!project || !desktop) return;
      const fresh: Record<string, Entry[]> = {};
      for (const path of Object.keys(tree)) {
        try {
          fresh[path] = await api.entries(project.path, path);
        } catch (error) {
          if (!path) {
            set({ error: String(error) });
            return;
          }
        }
      }
      if (get().generation === generation)
        set((state) => ({
          tree: {
            ...fresh,
            // Folders expanded while this refresh was reading stay loaded.
            ...Object.fromEntries(
              Object.entries(state.tree).filter(([path]) => !(path in tree)),
            ),
          },
        }));
    },
    copyEntry: (entry, cut) => {
      const { desktop, project, busy, tree } = get();
      if (
        !desktop ||
        !project ||
        busy ||
        !Object.values(tree).some((entries) =>
          entries.some((item) => sameDocumentPath(item.path, entry.path)),
        )
      )
        return;
      set({ clipboard: { root: project.path, entry, cut } });
    },
    pasteEntry: async (parent, name) => {
      const { clipboard, documents } = get();
      const target = ready();
      if (!clipboard || !target || target.root !== clipboard.root) return false;
      const path = clipboard.entry.path;
      const destination = [parent, name ?? clipboard.entry.name]
        .filter(Boolean)
        .join("/");
      if (
        documents.some((document) => isDocumentUnder(document.id, destination))
      ) {
        set({ error: OPEN_TARGET_ERROR });
        return false;
      }
      return operate(false, async () => {
        const moved = await target.advanced.transfer(
          target.root,
          path,
          parent,
          clipboard.cut,
          name,
        );
        if (clipboard.cut)
          set((state) => ({
            ...movedState(state, path, moved.path),
            clipboard: state.clipboard === clipboard ? null : state.clipboard,
          }));
        await get().refresh();
        await get().expand(parent);
        return true;
      });
    },
    createEntry: async (parent, name, directory) => {
      const target = ready();
      if (!target) return;
      const created = await operate<Entry | undefined>(undefined, async () => {
        const entry = await target.advanced.create(
          target.root,
          parent,
          name,
          directory,
        );
        await get().refresh();
        return entry;
      });
      if (created && !directory) await get().open(created);
    },
    renameEntry: async (path, name) => {
      const target = ready();
      if (!target) return;
      await operate(undefined, async () => {
        const renamed = await target.advanced.rename(target.root, path, name);
        set((state) => movedState(state, path, renamed.path));
        await get().refresh();
      });
    },
    moveFile: async (path, parent) => {
      const target = ready();
      if (!target) return false;
      const name = path.replace(/\\/g, "/").split("/").pop();
      if (!name) return false;
      const destination = parent ? `${parent}/${name}` : name;
      if (sameDocumentPath(path, destination)) return false;
      if (
        get().documents.some((document) =>
          sameDocumentPath(document.id, destination),
        )
      ) {
        set({ error: OPEN_TARGET_ERROR });
        return false;
      }
      return operate(false, async () => {
        const moved = await target.advanced.moveFile(target.root, path, parent);
        set((state) => ({
          documents: state.documents.map((document) =>
            sameDocumentPath(document.id, path)
              ? {
                  ...document,
                  id: moved.path,
                  name: moved.name,
                  folder: moved.path.split("/").slice(0, -1).join("/"),
                }
              : document,
          ),
          activeId:
            state.activeId && sameDocumentPath(state.activeId, path)
              ? moved.path
              : state.activeId,
          generation: state.generation + 1,
        }));
        await get().refresh();
        await get().expand(parent);
        return true;
      });
    },
    trashEntry: async (path) => {
      const target = ready();
      if (!target) return;
      await operate(undefined, async () => {
        await target.advanced.trash(target.root, path);
        set((state) => {
          const documents = state.documents.filter(
            (document) => !isDocumentUnder(document.id, path),
          );
          return {
            documents,
            activeId:
              state.activeId && isDocumentUnder(state.activeId, path)
                ? (documents[0]?.id ?? null)
                : state.activeId,
            tree: Object.fromEntries(
              Object.entries(state.tree).filter(
                ([key]) => !isDocumentUnder(key, path),
              ),
            ),
            generation: state.generation + 1,
          };
        });
        await get().refresh();
      });
    },
  };
}
