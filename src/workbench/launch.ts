import { t } from "../settings/i18n";
import {
  launchApi,
  workspaceApi,
  type LaunchApi,
  type LaunchTarget,
} from "../workspace/api";
import { sameDocumentPath, useWorkspace } from "../workspace/store";
import { revealDocument, setSettingsOpen } from "./actions";
import { confirmDocuments, requestAction } from "./dialogs";
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

/** Switches to the file's project (registering its folder if the user agrees) and opens it. */
async function openTarget(target: LaunchTarget, api: LaunchApi) {
  await whenIdle();
  let root: string;
  let path: string;
  if (target.kind === "outside") {
    const accepted = await requestAction({
      title: t("등록된 프로젝트 밖의 파일입니다"),
      body: t(
        "{0}\n\n폴더를 프로젝트로 등록하고 열까요?\n{1}",
        target.name,
        target.folder,
      ),
      label: t("폴더 등록 후 열기"),
    });
    if (accepted === null) return;
    root = (await api.register()).path;
    path = target.name;
    useWorkspace.setState({ projects: await workspaceApi.projects() });
    await whenIdle();
  } else ({ root, path } = target);
  const state = workspace();
  if (state.project?.path !== root) {
    const project = state.projects.find((project) => project.path === root);
    if (
      !project ||
      !(await confirmDocuments(state.documents)) ||
      !(await workspace().activate(project))
    )
      return;
  }
  setSettingsOpen(false);
  await workspace().open({ name: target.name, path, isDirectory: false });
  const { activeId } = workspace();
  if (activeId && sameDocumentPath(activeId, path))
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
      first?.kind === "project" ? first.root : undefined,
    );
    if (failure !== undefined) report(failure);
    if (first) await openTarget(first, api);
  })().catch(report);
  // Requests are handled one at a time so dialogs and project switches never overlap.
  const drain = () => {
    queue = queue
      .then(async () => {
        for (let target = await api.take(); target; target = await api.take())
          await openTarget(target, api).catch(report);
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
