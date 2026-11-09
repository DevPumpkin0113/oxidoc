import { workspaceApi, type WorkspaceApi } from "./api";
import { createWorkspaceStore, useWorkspace } from "./store";

const POLL_INTERVAL_MS = 3000;
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
      const directories = Object.keys(snapshot.tree);
      const paths = [
        ...new Set([
          ...directories,
          ...snapshot.documents.map((document) => document.id),
        ]),
      ];
      const result = await api.advanced.probe(root, paths);
      if (!valid() || !Array.isArray(result)) return;
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
