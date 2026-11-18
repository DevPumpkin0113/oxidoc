import { launchApi, type LaunchApi, type LaunchTarget } from "../workspace/api";
import { useWorkspace } from "../workspace/store";
import { openTarget, targetProject } from "./actions";
import { isModalOpen, useUi } from "./uiStore";

const workspace = () => useWorkspace.getState();
const report = (error: unknown) =>
  useWorkspace.setState({ error: `파일을 열지 못했습니다: ${String(error)}` });

/** Resolves once the workspace can switch projects and no dialog is open. */
function whenIdle() {
  const ready = () =>
    workspace().initialized &&
    !workspace().busy &&
    !isModalOpen(useUi.getState());
  return new Promise<void>((resolve) => {
    if (ready()) return resolve();
    const check = () => {
      if (!ready()) return;
      stopWorkspace();
      stopUi();
      resolve();
    };
    const stopWorkspace = useWorkspace.subscribe(check);
    const stopUi = useUi.subscribe(check);
  });
}

/** Opens a file from the OS in its project tab (or External). */
async function openLaunched(target: LaunchTarget) {
  await whenIdle();
  await openTarget(target);
}

/**
 * Starts the workspace and opens files handed over by the OS, both at startup
 * and when a later launch forwards its file to this window. Returns a cleanup.
 */
export function startWorkspace(desktop: boolean, api: LaunchApi = launchApi) {
  if (!desktop) {
    void workspace().initialize(false);
    return () => {};
  }
  let disposed = false;
  let stop: (() => void) | undefined;
  let queue = (async () => {
    let first: LaunchTarget | null = null;
    let failure: unknown;
    try {
      first = await api.take();
    } catch (error) {
      failure = error;
    }
    await workspace().initialize(
      true,
      first ? targetProject(first) : undefined,
    );
    if (failure !== undefined) report(failure);
    if (first) await openLaunched(first);
  })().catch(report);
  // Requests are handled one at a time so dialogs and project switches never overlap.
  const drain = () => {
    queue = queue
      .then(async () => {
        for (let target = await api.take(); target; target = await api.take())
          await openLaunched(target).catch(report);
      })
      .catch(report);
  };
  api
    .listen(drain)
    .then((unlisten) => {
      if (disposed) unlisten();
      else stop = unlisten;
    })
    .catch(report);
  drain();
  return () => {
    disposed = true;
    stop?.();
  };
}
