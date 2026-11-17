import { workspaceApi, type WorkspaceApi } from "./api";
import { createWorkspaceStore, useWorkspace } from "./store";
import { isImageFile } from "./documentTypes";

/** Fallback interval when the file watcher cannot start. */
const POLL_INTERVAL_MS = 3000;
const PROBE_BATCH_SIZE = 1000;
/** Retry delay for a check requested while the workspace is busy. */
const BUSY_RETRY_MS = 500;

/**
 * Detects external changes of the open project. Checks run when the file
 * watcher reports a change (or every 3 s if it cannot start) and when the
 * window regains focus.
 */
export function startWorkspaceMonitor(
  root: string,
  store: ReturnType<typeof createWorkspaceStore> = useWorkspace,
  api: WorkspaceApi = workspaceApi,
) {
  const stamps = new Map<string, string | null>();
  let stopped = false,
    running = false;
  /** Requested check, `true` when it must re-read everything; `null` if none. */
  let queued: boolean | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function request(force = false) {
    queued = (queued ?? false) || force;
    void drain();
  }
  // Runs one check at a time; requests made meanwhile are merged and run next,
  // so a change reported during a check or busy operation is not lost.
  async function drain() {
    if (stopped || running || queued === null) return;
    if (store.getState().busy) {
      clearTimeout(retry);
      retry = setTimeout(() => void drain(), BUSY_RETRY_MS);
      return;
    }
    const force = queued;
    queued = null;
    running = true;
    try {
      await check(force);
    } finally {
      running = false;
    }
    void drain();
  }

  async function check(force: boolean) {
    const snapshot = store.getState();
    if (!snapshot.desktop || snapshot.project?.path !== root || !api.advanced)
      return;
    const valid = () =>
      !stopped &&
      !store.getState().busy &&
      store.getState().project?.path === root &&
      store.getState().generation === snapshot.generation;
    try {
      const directories = [
        ...new Set([
          ...Object.keys(snapshot.tree),
          ...Object.values(snapshot.tree)
            .flat()
            .filter((entry) => entry.isDirectory)
            .map((entry) => entry.path),
        ]),
      ];
      const paths = [
        ...new Set([
          ...directories,
          ...snapshot.documents.map((document) => document.id),
        ]),
      ];
      const result = [];
      for (let index = 0; index < paths.length; index += PROBE_BATCH_SIZE) {
        const batch = await api.advanced.probe(
          root,
          paths.slice(index, index + PROBE_BATCH_SIZE),
        );
        if (!valid() || !Array.isArray(batch)) return;
        result.push(...batch);
      }
      let refresh = force;
      for (const item of result) {
        if (!valid()) {
          stamps.clear();
          return;
        }
        const changed =
          force ||
          !stamps.has(item.path) ||
          stamps.get(item.path) !== item.stamp;
        if (!changed) continue;
        if (directories.includes(item.path)) refresh = true;
        const document = snapshot.documents.find(
          (document) => document.id === item.path,
        );
        if (document && isImageFile(document.id)) {
          // The stamp is the image tab's revision: a change reloads the view,
          // and a missing file shows the load error there.
          const revision = item.stamp ?? "missing";
          store.setState((state) => ({
            documents: state.documents.map((current) =>
              current.id === document.id
                ? { ...current, content: revision, savedContent: revision }
                : current,
            ),
          }));
        } else if (document) {
          let content: string | null = null;
          try {
            content = await api.read(root, item.path);
          } catch {
            /* Missing or unreadable files keep their local buffers. */
          }
          if (!valid()) {
            stamps.clear();
            return;
          }
          const current = store
            .getState()
            .documents.find((current) => current.id === document.id);
          if (current?.savedContent === document.savedContent)
            store.getState().noticeExternal(item.path, content);
          else continue;
        }
        stamps.set(item.path, item.stamp);
      }
      // An existing grandchild directory can gain a document without changing
      // its ancestors' mtimes. Re-evaluate each loaded branch's bounded metadata
      // in document view, refreshing loaded branches only when it changes.
      if (!refresh && valid() && snapshot.layout.explorerView !== "all") {
        for (const path of Object.keys(snapshot.tree)) {
          const entries = await api.entries(root, path);
          if (!valid()) return;
          if (
            JSON.stringify(entries) !==
            JSON.stringify(store.getState().tree[path])
          ) {
            refresh = true;
            break;
          }
        }
      }
      if (refresh && valid()) await store.getState().refresh();
    } catch (error) {
      if (valid())
        store.setState({ error: `외부 변경 확인 실패: ${String(error)}` });
    }
  }

  let poll: ReturnType<typeof setInterval> | undefined = setInterval(
    () => request(),
    POLL_INTERVAL_MS,
  );
  let unwatch: (() => void) | undefined;
  api.advanced
    ?.watch?.(root, (batch) => request(batch.rescan))
    .then((stop) => {
      if (stopped) return stop();
      unwatch = stop;
      clearInterval(poll);
      poll = undefined;
      // Record a baseline for changes made before the watcher started.
      request();
    })
    .catch(() => {
      /* Keep polling when the watcher is unavailable. */
    });
  const focus = () => request(true);
  window.addEventListener("focus", focus);
  return () => {
    stopped = true;
    clearInterval(poll);
    clearTimeout(retry);
    unwatch?.();
    window.removeEventListener("focus", focus);
  };
}
