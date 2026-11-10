import { workspaceApi, type WorkspaceApi } from "./api";
import { createWorkspaceStore, useWorkspace } from "./store";

const POLL_INTERVAL_MS = 3000;
const PROBE_BATCH_SIZE = 1000;
export function startWorkspaceMonitor(
  root: string,
  store: ReturnType<typeof createWorkspaceStore> = useWorkspace,
  api: WorkspaceApi = workspaceApi,
) {
  const stamps = new Map<string, string | null>();
  let stopped = false,
    running = false;
  async function check(force = false) {
    const snapshot = store.getState();
    if (
      stopped ||
      running ||
      snapshot.busy ||
      !snapshot.desktop ||
      snapshot.project?.path !== root ||
      !api.advanced
    )
      return;
    running = true;
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
        if (document) {
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
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void check(), POLL_INTERVAL_MS);
  const focus = () => void check(true);
  window.addEventListener("focus", focus);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("focus", focus);
  };
}
