import type { EditorCommand } from "../components/MarkdownEditor";
import type { ScrollTarget } from "../components/MarkdownPreview";
import { t } from "../settings/i18n";
import { useSettings } from "../settings/store";
import { useUpdater } from "../settings/updater";
import {
  launchApi,
  workspaceApi,
  type LaunchTarget,
  type Project,
  type SearchMatch,
} from "../workspace/api";
import { headings, type LinkTarget } from "../workspace/markdown";
import {
  EXTERNAL_PROJECT,
  isDirty,
  isDocumentUnder,
  isExternal,
  sameDocumentPath,
  useWorkspace,
  type Layout,
} from "../workspace/store";
import { askUnsaved, confirmDocuments, requestAction } from "./dialogs";
import { isModalOpen, outlineTrigger, searchInput, useUi } from "./uiStore";

const workspace = () => useWorkspace.getState();
const currentRoot = () => workspace().project?.path;

export const setActivity = (activity: Layout["activity"]) =>
  workspace().setLayout({ activity });
export const setView = (view: Layout["view"]) =>
  workspace().setLayout({ view });
export function setSidebar(value: boolean | ((previous: boolean) => boolean)) {
  const state = workspace();
  state.setLayout({
    sidebar: typeof value === "function" ? value(state.layout.sidebar) : value,
  });
}
export const setSettingsOpen = (settingsOpen: boolean) =>
  useUi.setState({ settingsOpen });

export function toggleOutline() {
  workspace().setLayout({ outline: !workspace().layout.outline });
}
export function closeOutline() {
  workspace().setLayout({ outline: false });
  outlineTrigger.current?.focus();
}

/** Opens a picked folder as a project tab; the current tab stays open. */
export async function chooseProject() {
  const state = workspace();
  if (state.busy) return;
  const selected = await state.choose();
  if (selected && selected.path !== currentRoot())
    await workspace().activate(selected);
}

/**
 * Registers an External folder (its id) as a project and opens it in its own
 * tab with the External tabs from that folder, which close in External.
 */
export async function registerExternalFolder(folder: string) {
  const state = workspace();
  if (!isExternal(state.project) || state.busy) return;
  const relative = (id: string | null) =>
    id && isDocumentUnder(id, folder) && !sameDocumentPath(id, folder)
      ? id.slice(folder.length + 1)
      : null;
  const moving = state.documents.filter(
    (document) => relative(document.id) !== null,
  );
  // The folder's tabs reopen from disk in the project, so edits must be settled.
  if (!(await confirmDocuments(moving))) return;
  try {
    const project = await launchApi.register(folder);
    const { activeId, layout } = workspace();
    const paths = moving.map((document) => relative(document.id)!);
    for (const document of moving) workspace().close(document.id);
    useWorkspace.setState((state) => ({
      projects: [
        ...state.projects.filter((item) => item.path !== project.path),
        project,
      ],
      sessions: {
        ...state.sessions,
        [project.path]: {
          paths,
          activeId: relative(activeId) ?? paths[0] ?? null,
          layout: { ...layout, activity: "files" },
        },
      },
    }));
    await workspace().refresh();
    await workspace().activate(project);
  } catch (error) {
    useWorkspace.setState({ error: String(error) });
  }
}

/** Shows a project in its tab, opening the tab when needed. */
export async function activateProject(selected: Project) {
  const state = workspace();
  if (state.busy) return;
  if (state.project?.path === selected.path) {
    setActivity("files");
    return;
  }
  await workspace().activate(selected);
}

/** Unsaved documents of every tab, with the tab's root. */
function unsavedTabs() {
  const state = workspace();
  return [
    ...(state.project && state.documents.some(isDirty)
      ? [{ project: state.project, documents: state.documents.filter(isDirty) }]
      : []),
    ...Object.values(state.parked)
      .map((tab) => ({
        project: tab.project,
        documents: tab.documents.filter(isDirty),
      }))
      .filter((tab) => tab.documents.length),
  ];
}

/**
 * Settles unsaved edits of the tabs at `paths` (every tab by default) with
 * one save/discard/cancel choice. False when cancelled or a save fails.
 */
export async function confirmTabs(paths?: string[]) {
  const tabs = unsavedTabs().filter(
    (tab) => !paths || paths.includes(tab.project.path),
  );
  const several = tabs.length > 1 || tabs[0]?.project !== workspace().project;
  const choice = await askUnsaved(
    tabs.flatMap((tab) =>
      tab.documents.map((document) =>
        several ? `${tab.project.name} · ${document.name}` : document.name,
      ),
    ),
  );
  if (choice === "cancel") return false;
  for (const tab of tabs) {
    const active = tab.project.path === currentRoot();
    if (choice === "save") {
      if (active) {
        for (const document of tab.documents)
          if (!(await workspace().save(document.id))) return false;
      } else if (!(await workspace().saveParked(tab.project.path)))
        return false;
    } else if (!active) await workspace().discardParked(tab.project.path);
  }
  return true;
}

/** Closes a project tab after settling its unsaved edits. */
export async function closeProjectTab(path: string) {
  if (workspace().busy || !(await confirmTabs([path]))) return;
  await workspace().closeProject(path);
}

export async function closeDocuments(ids: string[]) {
  const state = workspace();
  if (state.busy) return;
  const root = state.project?.path;
  const targets = state.documents.filter((document) =>
    ids.includes(document.id),
  );
  if (!(await confirmDocuments(targets)) || currentRoot() !== root) return;
  for (const document of targets) workspace().close(document.id);
}

export async function saveAll() {
  const state = workspace();
  if (state.busy) return;
  const root = state.project?.path;
  for (const document of state.documents.filter(isDirty))
    if (currentRoot() !== root || !(await workspace().save(document.id)))
      return;
}

export async function revealDocument(id: string) {
  const root = currentRoot();
  workspace().setLayout({ sidebar: true, activity: "files" });
  const parts = id.split("/").slice(0, -1);
  // External lists each folder of opened files as one top-level row.
  const folders = isExternal(workspace().project)
    ? [parts.join("/")]
    : parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  for (const folder of folders) {
    if (currentRoot() !== root) return;
    await workspace().expand(folder);
  }
  if (currentRoot() === root) useUi.setState({ revealTarget: id });
}

export async function resolveDiskChange(id: string, reload: boolean) {
  const state = workspace();
  const root = state.project?.path;
  const document = state.documents.find((document) => document.id === id);
  if (!document || typeof document.diskContent !== "string") return;
  if (
    reload &&
    isDirty(document) &&
    !(await requestAction({
      title: t("미저장 변경을 버리고 다시 읽을까요?"),
      body: document.name,
      label: t("다시 읽기"),
    }))
  )
    return;
  if (currentRoot() === root) workspace().resolveExternal(id, reload);
}

export function openDocument(id: string) {
  setSettingsOpen(false);
  const document = workspace().documents.find((document) => document.id === id);
  if (document)
    void workspace().open({
      path: id,
      name: document.name,
      isDirectory: false,
    });
}

export function editorAction(id: EditorCommand["id"]) {
  setSettingsOpen(false);
  if (workspace().layout.view === "preview" && id === "find") {
    // Search the rendered preview instead of switching to the editor.
    useUi.setState(({ previewFind }) => ({ previewFind: previewFind + 1 }));
    return;
  }
  if (workspace().layout.view === "preview") setView("split");
  useUi.setState(({ command }) => ({
    command: { id, token: (command?.token ?? 0) + 1 },
  }));
}

export async function createEntry(parent: string, directory: boolean) {
  const sourceRoot = currentRoot();
  const name = await requestAction({
    title: directory ? t("새 폴더 이름") : t("새 문서 이름"),
    input: true,
    initial: directory ? t("새 폴더") : t("새 문서.md"),
    label: t("만들기"),
  });
  if (name !== null && currentRoot() === sourceRoot)
    await workspace().createEntry(parent, name, directory);
  if (name !== null && !directory) setSettingsOpen(false);
}

export function focusSearch() {
  setActivity("search");
  setSidebar(true);
  requestAnimationFrame(() => searchInput.current?.focus());
}

export function searchFolder(path: string) {
  const root = currentRoot();
  useUi.setState({ searchScope: root && path ? { root, path } : null });
  focusSearch();
}

export async function jump(match: SearchMatch) {
  setSettingsOpen(false);
  await workspace().open({
    path: match.path,
    name: match.name,
    isDirectory: false,
  });
  const activeId = workspace().activeId;
  if (!activeId || !sameDocumentPath(activeId, match.path)) return;
  if (workspace().layout.view === "preview") setView("split");
  useUi.setState({
    navigation: {
      documentId: activeId,
      line: match.line,
      column: match.column,
      token: Date.now(),
    },
  });
}

export function navigateTo(documentId: string, line: number) {
  useUi.setState({
    navigation: { documentId, line, column: 1, token: Date.now() },
  });
}

/** The workspace a launch or link target opens in: its project, or External. */
export function targetProject(target: LaunchTarget): Project {
  if (target.kind === "external") return EXTERNAL_PROJECT;
  return (
    workspace().projects.find((project) => project.path === target.root) ?? {
      name: target.root.split(/[\\/]/).filter(Boolean).pop() ?? target.root,
      path: target.root,
    }
  );
}

/**
 * Shows the target's project tab (opening it when needed; the current tab
 * stays open) and opens the target there. Resolves to the opened document id.
 */
export async function openTarget(target: LaunchTarget) {
  const state = workspace();
  const project = targetProject(target);
  if (
    state.project?.path !== project.path ||
    state.project.kind !== project.kind
  ) {
    if (!(await workspace().activate(project))) return null;
  }
  // A new External file must be listed in the explorer.
  if (target.kind === "external") await workspace().refresh();
  setSettingsOpen(false);
  await workspace().open({
    name: target.name,
    path: target.path,
    isDirectory: false,
  });
  const { activeId } = workspace();
  if (!activeId || !sameDocumentPath(activeId, target.path)) return null;
  await revealDocument(activeId);
  return activeId;
}

/**
 * Opens a local link from `source`. Links inside a project open here; Rust
 * resolves the others (and every External link) to the target's project tab
 * or External.
 */
async function openLink(
  target: Extract<LinkTarget, { kind: "local" | "outside" }>,
  source: string | undefined,
) {
  const root = currentRoot();
  if (target.kind === "local" && !isExternal(workspace().project)) {
    await workspace().open({
      path: target.path,
      name: target.path.split("/").pop() ?? target.path,
      isDirectory: false,
    });
    const { activeId } = workspace();
    return activeId && sameDocumentPath(activeId, target.path)
      ? activeId
      : null;
  }
  if (
    !root ||
    !source ||
    (isExternal(workspace().project) && target.kind === "outside")
  )
    throw t("지원하지 않는 링크 또는 프로젝트 외부 경로입니다.");
  return openTarget(await launchApi.follow(root, source, target.path));
}

export async function followLink(target: LinkTarget, source?: string) {
  if (target.kind === "external") {
    if (workspace().desktop)
      try {
        await workspaceApi.advanced!.external(target.url);
      } catch (error) {
        useWorkspace.setState({ error: String(error) });
      }
    else window.open(target.url, "_blank", "noopener,noreferrer");
  } else if (target.kind === "local" || target.kind === "outside") {
    let id: string | null;
    try {
      id = await openLink(target, source);
    } catch (error) {
      useWorkspace.setState({ error: String(error) });
      return;
    }
    const document = workspace().documents.find(
      (document) => document.id === id,
    );
    if (!document || workspace().activeId !== document.id) return;
    const heading = headings(document.content).find(
      (heading) => heading.id === target.hash,
    );
    navigateTo(document.id, heading?.line ?? 1);
  } else if (target.kind === "blocked")
    useWorkspace.setState({
      error: t("지원하지 않는 링크 또는 프로젝트 외부 경로입니다."),
    });
}

export function scroll(
  source: ScrollTarget["source"],
  line: number,
  edge?: ScrollTarget["edge"],
) {
  const { layout, activeId } = workspace();
  if (layout.sync && activeId)
    useUi.setState({
      scrollTarget: {
        source,
        line,
        edge,
        documentId: activeId,
        token: Date.now(),
      },
    });
}

export async function installUpdate() {
  const state = workspace();
  if (state.busy || isModalOpen(useUi.getState())) return;
  let locked = false;
  try {
    await useUpdater.getState().install(async () => {
      if (state.recoveryCandidates.length || state.recoveryError) {
        throw Error(t("문서 복구를 먼저 완료해 주세요."));
      }
      const accepted = await requestAction({
        title: t("업데이트 설치"),
        body: t("설치 중 앱이 종료되고 완료 후 다시 시작됩니다."),
        label: t("계속"),
      });
      if (accepted === null || !(await confirmTabs())) return false;
      if (workspace().busy) return false;
      useWorkspace.setState({ busy: true });
      locked = true;
      await workspace().persist();
      await useSettings.getState().flush();
      await workspace().flushRecovery(true);
      return true;
    });
  } finally {
    if (locked) {
      useWorkspace.setState({ busy: false });
      await workspace()
        .flushRecovery()
        .catch(() => {});
    }
  }
}
