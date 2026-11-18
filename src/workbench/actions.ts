import type { EditorCommand } from "../components/MarkdownEditor";
import type { ScrollTarget } from "../components/MarkdownPreview";
import { t } from "../settings/i18n";
import { useSettings } from "../settings/store";
import { useUpdater } from "../settings/updater";
import {
  launchApi,
  workspaceApi,
  type Project,
  type SearchMatch,
} from "../workspace/api";
import { headings, type LinkTarget } from "../workspace/markdown";
import {
  isDirty,
  isDocumentUnder,
  isExternal,
  sameDocumentPath,
  useWorkspace,
  type Layout,
} from "../workspace/store";
import { confirmDocuments, requestAction } from "./dialogs";
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

export async function chooseProject() {
  const state = workspace();
  if (state.busy || !(await confirmDocuments(state.documents))) return;
  const selected = await state.choose();
  if (selected && selected.path !== currentRoot())
    await workspace().activate(selected);
}

/**
 * Registers an External folder (its id) as a project and switches to it,
 * reopening the External tabs from that folder.
 */
export async function registerExternalFolder(folder: string) {
  const state = workspace();
  if (!isExternal(state.project) || state.busy) return;
  // Switching closes every External tab, so edits must be settled first.
  if (!(await confirmDocuments(state.documents))) return;
  try {
    const project = await launchApi.register(folder);
    const { documents, activeId, layout } = workspace();
    const relative = (id: string | null) =>
      id && isDocumentUnder(id, folder) && !sameDocumentPath(id, folder)
        ? id.slice(folder.length + 1)
        : null;
    const paths = documents
      .map((document) => relative(document.id))
      .filter((path): path is string => path !== null);
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
          layout,
        },
      },
    }));
    await workspace().activate(project);
  } catch (error) {
    useWorkspace.setState({ error: String(error) });
  }
}

export async function activateProject(selected: Project) {
  const state = workspace();
  if (state.busy) return;
  if (state.project?.path === selected.path) {
    setActivity("files");
    return;
  }
  if (await confirmDocuments(state.documents))
    await workspace().activate(selected);
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

/**
 * External opens only granted files, so a followed link first adds its target
 * (named by the document holding the link) and lists it in the explorer.
 */
async function linkedPath(source: string | undefined, path: string) {
  if (!isExternal(workspace().project) || !source) return path;
  const root = currentRoot();
  const target = await launchApi.link(source, path);
  if (currentRoot() !== root) return null;
  await workspace().refresh();
  return target.path;
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
  } else if (target.kind === "local") {
    let path: string | null;
    try {
      path = await linkedPath(source, target.path);
    } catch (error) {
      useWorkspace.setState({ error: String(error) });
      return;
    }
    if (path === null) return;
    await workspace().open({
      path,
      name: path.split("/").pop() ?? path,
      isDirectory: false,
    });
    const document = workspace().documents.find((document) =>
      sameDocumentPath(document.id, path),
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
      if (accepted === null || !(await confirmDocuments(workspace().documents)))
        return false;
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
