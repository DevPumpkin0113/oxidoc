import {
  launchApi,
  type LaunchApi,
  type LaunchTarget,
  type Project,
} from "../workspace/api";
import {
  EXTERNAL_PROJECT,
  sameDocumentPath,
  useWorkspace,
} from "../workspace/store";
import { revealDocument, setSettingsOpen } from "./actions";
import { confirmDocuments } from "./dialogs";
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

/** The workspace a launched file opens in: its project, or External. */
function targetProject(target: LaunchTarget): Project {
  if (target.kind === "external") return EXTERNAL_PROJECT;
  return (
    workspace().projects.find((project) => project.path === target.root) ?? {
      name: target.name,
      path: target.root,
    }
  );
}

/** Switches to the file's workspace and opens the file. */
async function openTarget(target: LaunchTarget) {
  await whenIdle();
  const state = workspace();
  const project = targetProject(target);
  if (
    state.project?.path !== project.path ||
    state.project.kind !== project.kind
  ) {
    if (
      !(await confirmDocuments(state.documents)) ||
      !(await workspace().activate(project))
    )
      return;
  } else if (target.kind === "external")
    // Another file for the open External workspace: list it in the explorer.
    await workspace().refresh();
  setSettingsOpen(false);
  await workspace().open({
    name: target.name,
    path: target.path,
    isDirectory: false,
  });
  const { activeId } = workspace();
  if (activeId && sameDocumentPath(activeId, target.path))
    await revealDocument(activeId);
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
    if (first) await openTarget(first);
  })().catch(report);
  // Requests are handled one at a time so dialogs and project switches never overlap.
  const drain = () => {
    queue = queue
      .then(async () => {
        for (let target = await api.take(); target; target = await api.take())
          await openTarget(target).catch(report);
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
