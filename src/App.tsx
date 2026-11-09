import { translateError, t } from "./settings/i18n";
import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Titlebar from "./components/Titlebar";
import Icon, { type IconName } from "./components/Icon";
import { FileIcon } from "./components/FileIcon";
import WorkspaceTree from "./components/WorkspaceTree";
import TreeDropTarget from "./components/TreeDropTarget";
import { blockExternalFileDrop } from "./workspace/treeDrag";
import { startWorkspaceMonitor } from "./workspace/monitor";
import QuickOpen from "./components/QuickOpen";
import ProjectReplace from "./components/ProjectReplace";
import UnsavedDialog, { type UnsavedChoice } from "./components/UnsavedDialog";
import {
  useWorkspace,
  isDirty,
  sameDocumentPath,
  isDocumentUnder,
  type Document,
} from "./workspace/store";
import {
  workspaceApi,
  type Project,
  type Entry,
  type SearchMatch,
} from "./workspace/api";
import ActionDialog, { type ActionRequest } from "./components/ActionDialog";
import ProjectManager from "./components/ProjectManager";
import ProjectSearch from "./components/ProjectSearch";
import CommandPalette, {
  type PaletteCommand,
} from "./components/CommandPalette";
import ContextMenu, { type MenuItem } from "./components/ContextMenu";
import {
  executeCommand,
  matchesShortcut,
  scopeMenu,
  type CommandTarget,
} from "./workspace/commands";
import { headings, type LinkTarget } from "./workspace/markdown";
import type { Navigation, ScrollTarget } from "./components/MarkdownPreview";
import type { EditorCommand, EditorContext } from "./components/MarkdownEditor";
import styles from "./App.module.css";
import SettingsPanel from "./components/SettingsPanel";
import {
  effectiveLanguage,
  effectiveTheme,
  useSettings,
} from "./settings/store";
import { themeVariables } from "./settings/themes";
import { copyText, inputMenu } from "./workspace/textContext";

const MarkdownEditor = lazy(() => import("./components/MarkdownEditor"));
const MarkdownPreview = lazy(() => import("./components/MarkdownPreview"));
type Activity = "files" | "search" | "projects";
type View = "edit" | "split" | "preview";
export default function App() {
  useEffect(() => {
    document.addEventListener("dragover", blockExternalFileDrop, true);
    document.addEventListener("drop", blockExternalFileDrop, true);
    return () => {
      document.removeEventListener("dragover", blockExternalFileDrop, true);
      document.removeEventListener("drop", blockExternalFileDrop, true);
    };
  }, []);
  const activities: { id: Activity; label: string; icon: IconName }[] = [
    { id: "files", label: t("탐색기"), icon: "files" },
    { id: "search", label: t("검색"), icon: "search" },
    { id: "projects", label: t("프로젝트"), icon: "projects" },
  ];
  const views: { id: View; label: string; icon: IconName }[] = [
    { id: "edit", label: t("편집"), icon: "code" },
    { id: "split", label: t("분할 보기"), icon: "split" },
    { id: "preview", label: t("미리보기"), icon: "preview" },
  ];

  const preferences = useSettings();
  const language = effectiveLanguage(preferences);
  const theme = effectiveTheme(preferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const initializeSettings = preferences.initialize;
  useEffect(() => {
    void initializeSettings();
  }, [initializeSettings]);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.style.colorScheme = theme.kind;
    root.dataset.theme = theme.id;
    for (const [key, value] of Object.entries(themeVariables(theme)))
      root.style.setProperty(key, value);
    root.style.setProperty(
      "--ui-font-size",
      `${preferences.settings.uiFontSize}px`,
    );
    root.style.setProperty(
      "--preview-font-size",
      `${preferences.settings.previewFontSize}px`,
    );
  }, [
    language,
    theme,
    preferences.settings.uiFontSize,
    preferences.settings.previewFontSize,
  ]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const changed = () =>
      useSettings.setState({ systemDark: media?.matches ?? false });
    const locale = () => {
      void useSettings.getState().refreshLocale();
    };
    media?.addEventListener("change", changed);
    window.addEventListener("languagechange", locale);
    window.addEventListener("focus", locale);
    return () => {
      media?.removeEventListener("change", changed);
      window.removeEventListener("languagechange", locale);
      window.removeEventListener("focus", locale);
    };
  }, []);
  const {
    documents,
    activeId,
    project,
    projects,
    busy,
    error,
    desktop,
    initialize,
    save,
    edit,
    open,
    close,
    clearError,
    recoveryCandidates,
    recoveryError,
  } = useWorkspace();
  const layout = useWorkspace((state) => state.layout);
  const activity = layout.activity,
    sidebar = layout.sidebar,
    view = layout.view;
  const setActivity = useCallback(
    (activity: Activity) => useWorkspace.getState().setLayout({ activity }),
    [],
  );
  const setSidebar = useCallback(
    (value: boolean | ((previous: boolean) => boolean)) => {
      const state = useWorkspace.getState();
      state.setLayout({
        sidebar:
          typeof value === "function" ? value(state.layout.sidebar) : value,
      });
    },
    [],
  );
  const setView = useCallback(
    (view: View) => useWorkspace.getState().setLayout({ view }),
    [],
  );
  const [actionRequest, setActionRequest] = useState<ActionRequest | null>(
    null,
  );
  const [palette, setPalette] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [paletteCommands, setPaletteCommands] = useState<PaletteCommand[]>([]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
    returnFocus: HTMLElement | null;
    title?: string;
  } | null>(null);
  const explorerTree = useRef<HTMLDetailsElement>(null);
  const [revealTarget, setRevealTarget] = useState<string | null>(null);
  const [searchScope, setSearchScope] = useState<{
    root: string;
    path: string;
  } | null>(null);
  const [command, setCommand] = useState<EditorCommand>();
  const clearCommand = useCallback(() => setCommand(undefined), []);
  const [navigation, setNavigation] = useState<
    Navigation & { documentId: string }
  >();
  const [scrollTarget, setScrollTarget] = useState<
    ScrollTarget & { documentId: string }
  >();
  const modalOpen = useRef(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [sampleNotice, setSampleNotice] = useState(true);
  const [confirmation, setConfirmation] = useState<{
    names: string[];
    resolve: (choice: UnsavedChoice) => void;
  } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const outlineTrigger = useRef<HTMLButtonElement>(null);
  const closeOutline = useCallback(() => {
    useWorkspace.getState().setLayout({ outline: false });
    outlineTrigger.current?.focus();
  }, []);
  const choicePromise = useRef<Promise<UnsavedChoice> | null>(null);
  const activeDocument = documents.find((document) => document.id === activeId);
  const monitoredRoot = project?.path;
  const projectStatus = project?.status;
  const projectFolderName =
    project?.path === "sample"
      ? project.name
      : (project?.path.split(/[\\/]/).filter(Boolean).pop() ?? project?.name);
  const openTabs = documents.map((document) => document.id);
  const deferredContent = useDeferredValue(activeDocument?.content ?? "");
  const outlineHeadings = useMemo(
    () => headings(deferredContent),
    [deferredContent],
  );
  const dirty = (id: string) =>
    documents.some((document) => document.id === id && isDirty(document));

  useEffect(() => {
    void initialize(isTauri());
  }, [initialize]);
  useEffect(() => {
    if (
      desktop &&
      monitoredRoot &&
      (!projectStatus || projectStatus === "available")
    )
      return startWorkspaceMonitor(monitoredRoot);
  }, [desktop, monitoredRoot, projectStatus]);
  const confirmDocuments = useCallback(
    async (targets: Document[]) => {
      const modified = targets.filter(isDirty);
      if (!modified.length) return true;
      if (!choicePromise.current)
        choicePromise.current = new Promise<UnsavedChoice>((resolve) =>
          setConfirmation({
            names: modified.map((document) => document.name),
            resolve,
          }),
        );
      const choice = await choicePromise.current;
      if (choice === "cancel") return false;
      if (choice === "save")
        for (const document of modified)
          if (!(await save(document.id))) return false;
      return true;
    },
    [save],
  );
  function resolveConfirmation(choice: UnsavedChoice) {
    confirmation?.resolve(choice);
    choicePromise.current = null;
    setConfirmation(null);
  }
  const chooseProject = useCallback(async () => {
    const state = useWorkspace.getState();
    if (state.busy || !(await confirmDocuments(state.documents))) return;
    const selected = await state.choose();
    if (selected && selected.path !== useWorkspace.getState().project?.path)
      await useWorkspace.getState().activate(selected);
  }, [confirmDocuments]);
  async function activateProject(selected: Project) {
    if (busy) return;
    if (project?.path === selected.path) {
      setActivity("files");
      return;
    }
    if (await confirmDocuments(documents))
      await useWorkspace.getState().activate(selected);
  }
  async function closeDocument(id: string) {
    if (busy) return;
    if (
      await confirmDocuments(documents.filter((document) => document.id === id))
    )
      close(id);
  }
  async function closeDocuments(ids: string[]) {
    const state = useWorkspace.getState();
    if (state.busy) return;
    const root = state.project?.path;
    const targets = state.documents.filter((document) =>
      ids.includes(document.id),
    );
    if (
      !(await confirmDocuments(targets)) ||
      useWorkspace.getState().project?.path !== root
    )
      return;
    for (const document of targets) useWorkspace.getState().close(document.id);
  }
  async function saveAll() {
    const state = useWorkspace.getState();
    if (state.busy) return;
    const root = state.project?.path;
    for (const document of state.documents.filter(isDirty)) {
      if (
        useWorkspace.getState().project?.path !== root ||
        !(await useWorkspace.getState().save(document.id))
      )
        return;
    }
  }
  async function revealDocument(id: string) {
    const root = useWorkspace.getState().project?.path;
    useWorkspace.getState().setLayout({ sidebar: true, activity: "files" });
    const parts = id.split("/").slice(0, -1);
    for (let index = 1; index <= parts.length; index++) {
      if (useWorkspace.getState().project?.path !== root) return;
      await useWorkspace.getState().expand(parts.slice(0, index).join("/"));
    }
    if (useWorkspace.getState().project?.path === root) setRevealTarget(id);
  }
  useEffect(() => {
    if (!revealTarget || !explorerTree.current) return;
    const folder = useWorkspace
      .getState()
      .documents.find((document) =>
        sameDocumentPath(document.id, revealTarget),
      )?.folder;
    explorerTree.current.open = true;
    const rows =
      explorerTree.current.querySelectorAll<HTMLElement>("[data-tree-path]");
    for (const row of rows) {
      const path = row.dataset.treePath;
      if (
        path &&
        (isDocumentUnder(revealTarget, path) ||
          (folder && isDocumentUnder(folder, path)))
      ) {
        if (
          row.matches("summary") &&
          row.parentElement instanceof HTMLDetailsElement
        )
          row.parentElement.open = true;
        if (sameDocumentPath(path, revealTarget)) {
          const target =
            row.tagName === "SUMMARY"
              ? row
              : row.querySelector<HTMLElement>("button");
          target?.focus();
          target?.scrollIntoView?.({ block: "nearest" });
        }
      }
    }
    setRevealTarget(null);
  }, [revealTarget]);
  function manageTab(id: string, x: number, y: number) {
    const state = useWorkspace.getState();
    const document = state.documents.find((document) => document.id === id);
    if (!document || !state.project) return;
    const ids = state.documents.map((document) => document.id);
    const index = ids.indexOf(id);
    const items: MenuItem[] = [
      { label: t("닫기"), run: () => closeDocuments([id]) },
      {
        label: t("다른 탭 닫기"),
        disabled: ids.length < 2,
        run: () => closeDocuments(ids.filter((other) => other !== id)),
      },
      {
        label: t("오른쪽 탭 닫기"),
        disabled: index === ids.length - 1,
        run: () => closeDocuments(ids.slice(index + 1)),
      },
      { label: t("모든 탭 닫기"), run: () => closeDocuments(ids) },
      { type: "separator", id: "tab-save" },
      {
        label: t("모두 저장"),
        icon: "save",
        requiresDesktop: true,
        disabled: !state.documents.some(isDirty),
        run: saveAll,
      },
      { type: "separator", id: "tab-path" },
      { label: t("탐색기에서 위치 표시"), run: () => revealDocument(id) },
      ...locationActions(state.project.path, id).map((item) =>
        item.type === "separator" ? item : { ...item, requiresDesktop: true },
      ),
    ];
    showContext(
      document.name,
      items.map((item) =>
        item.type === "separator"
          ? item
          : {
              ...item,
              target: { kind: "document", root: state.project!.path, id },
            },
      ),
      x,
      y,
    );
  }
  async function resolveDiskChange(id: string, reload: boolean) {
    const state = useWorkspace.getState();
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
    if (useWorkspace.getState().project?.path === root)
      useWorkspace.getState().resolveExternal(id, reload);
  }
  function openDocument(id: string) {
    setSettingsOpen(false);
    const document = documents.find((document) => document.id === id);
    if (document)
      void open({ path: id, name: document.name, isDirectory: false });
  }

  useEffect(() => {
    modalOpen.current = Boolean(
      confirmation ||
      actionRequest ||
      palette ||
      quickOpen ||
      replaceOpen ||
      menu,
    );
  }, [confirmation, actionRequest, palette, quickOpen, replaceOpen, menu]);
  const requestAction = useCallback(
    (request: Omit<ActionRequest, "resolve">) =>
      new Promise<string | null>((resolve) =>
        setActionRequest({ ...request, resolve }),
      ),
    [],
  );
  function resolveAction(value: string | null) {
    actionRequest?.resolve(value);
    setActionRequest(null);
  }
  function editorAction(id: EditorCommand["id"]) {
    setSettingsOpen(false);
    if (view === "preview") setView("split");
    setCommand((previous) => ({ id, token: (previous?.token ?? 0) + 1 }));
  }
  async function createEntry(parent: string, directory: boolean) {
    const sourceRoot = useWorkspace.getState().project?.path;
    const name = await requestAction({
      title: directory ? t("새 폴더 이름") : t("새 문서 이름"),
      input: true,
      initial: directory ? t("새 폴더") : t("새 문서.md"),
      label: t("만들기"),
    });
    if (name !== null && useWorkspace.getState().project?.path === sourceRoot)
      await useWorkspace.getState().createEntry(parent, name, directory);
    if (name !== null && !directory) setSettingsOpen(false);
  }
  function showContext(
    title: string,
    items: MenuItem[],
    x: number,
    y: number,
    returnFocus?: HTMLElement,
  ) {
    setMenu({
      title,
      items,
      x,
      y,
      returnFocus:
        returnFocus ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null),
    });
  }
  function searchFolder(path: string) {
    const root = useWorkspace.getState().project?.path;
    setSearchScope(root && path ? { root, path } : null);
    setActivity("search");
    setSidebar(true);
    requestAnimationFrame(() => searchInput.current?.focus());
  }
  function locationActions(root: string, path: string): MenuItem[] {
    return [
      {
        label: t("탐색기에서 열기"),
        icon: "folder",
        run: () => workspaceApi.advanced!.explorer(root, path),
      },
      {
        label: t("경로 복사"),
        icon: "copy",
        run: async () =>
          copyText(await workspaceApi.advanced!.entryPath(root, path)),
      },
      {
        label: t("상대 경로 복사"),
        icon: "copy",
        run: () => copyText(path || "."),
      },
    ];
  }
  async function pasteInto(parent: string) {
    const state = useWorkspace.getState();
    const clipboard = state.clipboard;
    if (!clipboard || clipboard.root !== state.project?.path) return;
    await state.expand(parent);
    let name: string | undefined;
    if (
      useWorkspace
        .getState()
        .tree[parent]?.some(
          (entry) =>
            entry.name.toLowerCase() === clipboard.entry.name.toLowerCase(),
        )
    ) {
      const result = await requestAction({
        title: t("다른 이름으로 붙여넣기"),
        body: t("같은 이름의 항목이 이미 있습니다."),
        initial: clipboard.entry.name,
        input: true,
      });
      if (result === null) return;
      name = result;
    }
    if (
      useWorkspace.getState().clipboard === clipboard &&
      useWorkspace.getState().project?.path === clipboard.root
    )
      await useWorkspace.getState().pasteEntry(parent, name);
  }
  function pasteAction(parent: string): MenuItem {
    const state = useWorkspace.getState();
    return {
      id: "entry-paste",
      label: t("붙여넣기"),
      icon: "paste",
      shortcut: "Ctrl+V",
      disabled:
        !state.clipboard || state.clipboard.root !== state.project?.path,
      run: () => pasteInto(parent),
    };
  }
  function entryClipboardActions(entry: Entry): MenuItem[] {
    const parent = entry.isDirectory
      ? entry.path
      : entry.path.split("/").slice(0, -1).join("/");
    return [
      {
        id: "entry-cut",
        label: t("잘라내기"),
        icon: "cut",
        shortcut: "Ctrl+X",
        run: () => useWorkspace.getState().copyEntry(entry, true),
      },
      {
        id: "entry-copy",
        label: t("복사"),
        icon: "copy",
        shortcut: "Ctrl+C",
        run: () => useWorkspace.getState().copyEntry(entry, false),
      },
      pasteAction(parent),
      { type: "separator", id: "entry-clipboard" },
    ];
  }
  function manageExplorer(x: number, y: number) {
    const current = useWorkspace.getState().project;
    if (!current) {
      showContext(
        t("탐색기"),
        buildPaletteCommands().filter((command) =>
          ["open", "settings"].includes(command.id),
        ),
        x,
        y,
      );
      return;
    }
    const items: MenuItem[] = [
      { label: t("새 문서"), icon: "add", run: () => createEntry("", false) },
      { label: t("새 폴더"), icon: "folder", run: () => createEntry("", true) },
      pasteAction(""),
      { type: "separator", id: "root-paths" },
      ...locationActions(current.path, ""),
      { type: "separator", id: "root-view" },
      {
        label: t("새로고침"),
        icon: "refresh",
        run: () => useWorkspace.getState().refresh(),
      },
      {
        label: t("모두 접기"),
        icon: "collapse",
        run: () => {
          explorerTree.current
            ?.querySelectorAll("details")
            .forEach((details) => {
              details.open = false;
            });
        },
      },
    ];
    const origin = explorerTree.current?.querySelector<HTMLElement>("summary");
    origin?.focus();
    showContext(
      current.name,
      scopeMenu(items, { kind: "project", path: current.path }),
      x,
      y,
      origin ?? undefined,
    );
  }
  function manageEditor(context: EditorContext) {
    const state = useWorkspace.getState();
    if (!state.project || !state.activeId) return;
    const target: CommandTarget = {
      kind: "document",
      root: state.project.path,
      id: state.activeId,
      active: true,
    };
    const items: MenuItem[] = [
      {
        label: t("잘라내기"),
        icon: "cut",
        disabled: !context.hasSelection || context.readOnly,
        run: () => editorAction("cut"),
      },
      {
        label: t("복사"),
        icon: "copy",
        disabled: !context.hasSelection,
        allowBusy: true,
        run: () => editorAction("copy"),
      },
      {
        label: t("붙여넣기"),
        icon: "paste",
        disabled: context.readOnly,
        run: () => editorAction("paste"),
      },
      { type: "separator", id: "editor-select" },
      {
        label: t("모두 선택"),
        allowBusy: true,
        run: () => editorAction("selectAll"),
      },
      {
        label: t("문서 내 찾기"),
        icon: "search",
        run: () => editorAction("find"),
      },
      { label: t("문서 내 바꾸기"), run: () => editorAction("replace") },
    ];
    showContext(
      t("Markdown 편집기"),
      items.map((item) =>
        item.type === "separator" ? item : { ...item, target },
      ),
      context.x,
      context.y,
    );
  }
  function entryMenuItems(entry: Entry): MenuItem[] {
    const root = useWorkspace.getState().project?.path;
    if (!root) return [];
    const items: MenuItem[] = entryClipboardActions(entry);
    items.push(...locationActions(root, entry.path), {
      type: "separator",
      id: "entry-location",
    });
    if (entry.isDirectory) {
      items.push(
        {
          label: t("새 문서"),
          icon: "add",
          run: () => createEntry(entry.path, false),
        },
        {
          label: t("새 폴더"),
          icon: "folder",
          run: () => createEntry(entry.path, true),
        },
        { type: "separator", id: "entry-create" },
        {
          label: t("이 폴더에서 검색"),
          icon: "search",
          run: () => searchFolder(entry.path),
        },
        { type: "separator", id: "entry-search" },
      );
    }
    items.push(
      {
        id: "entry-rename",
        label: t("이름 변경"),
        icon: "rename",
        shortcut: "F2",
        run: async () => {
          const name = await requestAction({
            title: t("이름 변경"),
            initial: entry.name,
            input: true,
          });
          if (name !== null && useWorkspace.getState().project?.path === root)
            await useWorkspace.getState().renameEntry(entry.path, name);
        },
      },
      { type: "separator", id: "entry-trash" },
      {
        id: "entry-delete",
        label: t("휴지통으로 이동"),
        icon: "trash",
        danger: true,
        shortcut: "Delete",
        run: async () => {
          const affected = useWorkspace
            .getState()
            .documents.filter((document) =>
              isDocumentUnder(document.id, entry.path),
            );
          if (!(await confirmDocuments(affected))) return;
          const confirm = await requestAction({
            title: t("휴지통으로 이동할까요?"),
            body: t(
              "{0}{1}",
              entry.path,
              entry.isDirectory ? t(" · 하위 항목 포함") : "",
            ),
            label: t("휴지통으로 이동"),
          });
          if (confirm && useWorkspace.getState().project?.path === root)
            await useWorkspace.getState().trashEntry(entry.path);
        },
      },
    );
    return scopeMenu(items, { kind: "entry", root, path: entry.path });
  }
  function manageEntry(entry: Entry, x: number, y: number) {
    setMenu({
      x,
      y,
      title: entry.name,
      returnFocus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      items: entryMenuItems(entry),
    });
  }
  function manageProject(item: Project, x: number, y: number) {
    setMenu({
      x,
      y,
      title: item.name,
      returnFocus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      items: scopeMenu(
        [
          {
            label: t("프로젝트 열기"),
            icon: "projects",
            run: () => activateProject(item),
          },
          {
            label: t(item.favorite ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"),
            icon: "star",
            checked: Boolean(item.favorite),
            run: () => {
              const latest = useWorkspace
                .getState()
                .projects.find((project) => project.path === item.path);
              if (latest)
                return useWorkspace
                  .getState()
                  .updateProject(item.path, { favorite: !latest.favorite });
            },
          },
          { type: "separator", id: "project-location" },
          ...locationActions(item.path, "").slice(0, 2),
          { type: "separator", id: "project-details" },
          {
            label: t("표시 이름 변경"),
            icon: "rename",
            run: async () => {
              const name = await requestAction({
                title: t("프로젝트 이름 변경"),
                initial: item.name,
                input: true,
              });
              if (name !== null)
                await useWorkspace
                  .getState()
                  .updateProject(item.path, { name });
            },
          },
          {
            label: t("태그 편집"),
            icon: "tag",
            run: async () => {
              const tags = await requestAction({
                title: t("프로젝트 태그"),
                body: t("쉼표로 구분해 입력하세요. 비우면 태그가 제거됩니다."),
                initial: item.tags?.join(", ") ?? "",
                input: true,
                allowEmpty: true,
              });
              if (tags !== null)
                await useWorkspace.getState().updateProject(item.path, {
                  tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                });
            },
          },
          {
            label: t("폴더 경로 다시 연결"),
            icon: "folder",
            run: async () => {
              if (
                project?.path === item.path &&
                !(await confirmDocuments(documents))
              )
                return;
              await useWorkspace.getState().relocateProject(item.path);
            },
          },
          { type: "separator", id: "project-remove" },
          {
            label: t("목록에서 제거"),
            icon: "close",
            danger: true,
            run: async () => {
              if (
                project?.path === item.path &&
                !(await confirmDocuments(documents))
              )
                return;
              const confirm = await requestAction({
                title: t("프로젝트를 목록에서 제거할까요?"),
                body: t("{0} · 실제 폴더와 파일은 유지됩니다.", item.name),
                label: t("목록에서 제거"),
              });
              if (confirm)
                await useWorkspace.getState().removeProject(item.path);
            },
          },
        ],
        { kind: "project", path: item.path },
      ),
    });
  }
  async function jump(match: SearchMatch) {
    setSettingsOpen(false);
    await open({ path: match.path, name: match.name, isDirectory: false });
    const activeId = useWorkspace.getState().activeId;
    if (!activeId || !sameDocumentPath(activeId, match.path)) return;
    if (view === "preview") setView("split");
    setNavigation({
      documentId: activeId,
      line: match.line,
      column: match.column,
      token: Date.now(),
    });
  }
  async function followLink(target: LinkTarget) {
    if (target.kind === "external") {
      if (desktop)
        try {
          await workspaceApi.advanced!.external(target.url);
        } catch (error) {
          useWorkspace.setState({ error: String(error) });
        }
      else window.open(target.url, "_blank", "noopener,noreferrer");
    } else if (target.kind === "local") {
      await open({
        path: target.path,
        name: target.path.split("/").pop() ?? target.path,
        isDirectory: false,
      });
      const document = useWorkspace
        .getState()
        .documents.find((document) =>
          sameDocumentPath(document.id, target.path),
        );
      if (!document || useWorkspace.getState().activeId !== document.id) return;
      const heading = headings(document.content).find(
        (heading) => heading.id === target.hash,
      );
      setNavigation({
        documentId: document.id,
        line: heading?.line ?? 1,
        column: 1,
        token: Date.now(),
      });
    } else if (target.kind === "blocked")
      useWorkspace.setState({
        error: t("지원하지 않는 링크 또는 프로젝트 외부 경로입니다."),
      });
  }
  function scroll(
    source: ScrollTarget["source"],
    line: number,
    edge?: ScrollTarget["edge"],
  ) {
    if (layout.sync && activeId)
      setScrollTarget({
        source,
        line,
        edge,
        documentId: activeId,
        token: Date.now(),
      });
  }
  function buildPaletteCommands(): PaletteCommand[] {
    const documentTarget: CommandTarget | undefined =
      activeDocument && project
        ? {
            kind: "document",
            root: project.path,
            id: activeDocument.id,
            active: true,
          }
        : undefined;
    const commands: PaletteCommand[] = [
      {
        id: "settings",
        label: t("설정"),
        detail: "Ctrl ,",
        shortcut: "Ctrl+,",
        allowBusy: true,
        run: () => setSettingsOpen(true),
      },
      {
        id: "open",
        label: t("프로젝트 폴더 열기"),
        detail: "Ctrl O",
        shortcut: "Ctrl+O",
        requiresDesktop: true,
        run: () => chooseProject(),
      },
      {
        id: "quick-open",
        label: t("빠른 파일 열기"),
        detail: "Ctrl P",
        enabled: () => Boolean(useWorkspace.getState().project),
        run: () => setQuickOpen(true),
      },
      {
        id: "replace-project",
        label: t("프로젝트 전체 바꾸기"),
        shortcut: "Ctrl+Shift+H",
        requiresDesktop: true,
        enabled: () => Boolean(useWorkspace.getState().project),
        run: () => setReplaceOpen(true),
      },
      {
        id: "sidebar",
        label: t("사이드바 표시/숨기기"),
        detail: "Ctrl B",
        shortcut: "Ctrl+B",
        allowBusy: true,
        run: () => setSidebar((value) => !value),
      },
      {
        id: "search",
        label: t("프로젝트 전체 검색"),
        detail: "Ctrl K",
        shortcut: "Ctrl+K",
        allowBusy: true,
        run: () => {
          searchFolder("");
        },
      },
      ...(project && desktop
        ? [
            {
              id: "new-file",
              label: t("새 문서"),
              requiresDesktop: true,
              enabled: () =>
                useWorkspace.getState().project?.path === project.path,
              run: () => createEntry("", false),
            },
            {
              id: "new-folder",
              label: t("새 폴더"),
              requiresDesktop: true,
              enabled: () =>
                useWorkspace.getState().project?.path === project.path,
              run: () => createEntry("", true),
            },
          ]
        : []),
      ...(activeDocument
        ? [
            {
              id: "save",
              label: t("문서 저장"),
              detail: "Ctrl S",
              shortcut: "Ctrl+S",
              requiresDesktop: true,
              target: documentTarget,
              run: () => save(activeDocument.id),
            },
            {
              id: "save-as",
              label: t("다른 이름으로 저장"),
              detail: "Ctrl Shift S",
              shortcut: "Ctrl+Shift+S",
              requiresDesktop: true,
              target: documentTarget,
              run: () => useWorkspace.getState().saveAs(activeDocument.id),
            },
            {
              id: "find",
              label: t("문서 내 찾기"),
              detail: "Ctrl F",
              shortcut: "Ctrl+F",
              target: documentTarget,
              run: () => editorAction("find"),
            },
            {
              id: "replace",
              label: t("문서 내 바꾸기"),
              detail: "Ctrl H",
              shortcut: "Ctrl+H",
              target: documentTarget,
              run: () => editorAction("replace"),
            },
            {
              id: "outline",
              label: t("문서 개요 표시/숨기기"),
              target: documentTarget,
              run: () =>
                useWorkspace.getState().setLayout({
                  outline: !useWorkspace.getState().layout.outline,
                }),
            },
          ]
        : []),
      {
        id: "save-all",
        label: t("모두 저장"),
        shortcut: "Ctrl+Alt+S",
        requiresDesktop: true,
        run: saveAll,
      },
      {
        id: "reopen-tab",
        label: t("닫은 탭 다시 열기"),
        shortcut: "Ctrl+Shift+T",
        enabled: () => {
          const state = useWorkspace.getState();
          return Boolean(
            state.project && state.closedEntries[state.project.path]?.length,
          );
        },
        run: () => useWorkspace.getState().reopenClosed(),
      },
      ...(activeDocument
        ? [
            {
              id: "reveal-document",
              label: t("탐색기에서 위치 표시"),
              target: documentTarget,
              run: () => revealDocument(activeDocument.id),
            },
          ]
        : []),
      {
        id: "close-tab",
        label: t("현재 탭 닫기"),
        shortcut: "Ctrl+W",
        enabled: () =>
          settingsOpen || Boolean(useWorkspace.getState().activeId),
        run: () => {
          if (settingsOpen) {
            setSettingsOpen(false);
            return;
          }
          const id = useWorkspace.getState().activeId;
          if (id) return closeDocuments([id]);
        },
      },
      {
        id: "close-all-tabs",
        label: t("모든 탭 닫기"),
        enabled: () => useWorkspace.getState().documents.length > 0,
        run: () =>
          closeDocuments(
            useWorkspace.getState().documents.map((document) => document.id),
          ),
      },
      ...projects.map((item, index) => ({
        id: `project-${index}`,
        label: t("프로젝트 열기: {0}", item.name),
        detail: item.path,
        target: { kind: "project", path: item.path } as CommandTarget,
        run: () => activateProject(item),
      })),
      ...documents.map((document, index) => ({
        id: `document-${index}`,
        label: t("문서 전환: {0}", document.name),
        detail: document.folder,
        target: {
          kind: "document",
          root: project?.path ?? "",
          id: document.id,
        } as CommandTarget,
        run: () => openDocument(document.id),
      })),
    ];
    return commands.map((item) => ({
      ...item,
      run: () => {
        setPalette(false);
        return item.run();
      },
    }));
  }
  function runAppCommand(id: string) {
    const command = buildPaletteCommands().find((command) => command.id === id);
    if (command) void executeCommand(command);
  }
  function openPalette() {
    setPaletteCommands(buildPaletteCommands());
    setPalette(true);
  }
  const handleContext = useEffectEvent((event: MouseEvent) => {
    event.preventDefault();
    if (menu || !(event.target instanceof Element)) return;
    const target = event.target;
    const input = target.closest<HTMLInputElement | HTMLTextAreaElement>(
      "input,textarea",
    );
    if (
      input &&
      !input.classList.contains("inputarea") &&
      input.selectionStart !== null
    ) {
      showContext(
        t("텍스트 편집"),
        inputMenu(input),
        event.clientX,
        event.clientY,
        input,
      );
      return;
    }
    if (palette || quickOpen || replaceOpen || confirmation || actionRequest)
      return;
    if (target.closest('[data-explorer="true"]') && !target.closest("nav")) {
      manageExplorer(event.clientX, event.clientY);
      return;
    }
    const selection = window.getSelection()?.toString() ?? "";
    const projectPanel = Boolean(target.closest("[data-projects-panel]"));
    const ids =
      projectPanel || !project
        ? ["open", "sidebar", "settings"]
        : [
            "new-file",
            "new-folder",
            "save",
            "find",
            "outline",
            "sidebar",
            "settings",
          ];
    const commands = buildPaletteCommands()
      .filter((command) => ids.includes(command.id))
      .map((command) =>
        projectPanel && command.id === "open"
          ? { ...command, label: t("프로젝트 등록") }
          : command,
      );
    const items: MenuItem[] = selection
      ? [
          {
            label: t("복사"),
            icon: "copy",
            allowBusy: true,
            run: () => copyText(selection),
          },
          { type: "separator", id: "selection" },
          ...commands,
        ]
      : commands;
    showContext(
      target.closest("[data-projects-panel]") ? t("프로젝트") : "Oxidoc",
      items,
      event.clientX,
      event.clientY,
    );
  });
  useEffect(() => {
    window.addEventListener("contextmenu", handleContext);
    return () => window.removeEventListener("contextmenu", handleContext);
  }, []);

  const handleKeyboard = useEffectEvent(function keydown(event: KeyboardEvent) {
    if (
      event.key === "Escape" &&
      layout.outline &&
      !modalOpen.current &&
      !event.isComposing &&
      !event.defaultPrevented
    ) {
      event.preventDefault();
      closeOutline();
      return;
    }
    if (
      modalOpen.current ||
      confirmation ||
      event.isComposing ||
      event.defaultPrevented
    )
      return;
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (
      element?.closest('[data-explorer="true"]') &&
      !element.closest('input,textarea,[contenteditable="true"],.monaco-editor')
    ) {
      const node = element.closest<HTMLElement>("[data-tree-path]");
      const path = node?.dataset.treePath;
      if (path !== undefined) {
        const entry = Object.values(useWorkspace.getState().tree)
          .flat()
          .find((entry) => sameDocumentPath(entry.path, path));
        const operation =
          (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
            ? { c: "entry-copy", x: "entry-cut", v: "entry-paste" }[
                event.key.toLowerCase() as "c" | "x" | "v"
              ]
            : undefined;
        if (operation) {
          const items = entry
            ? entryClipboardActions(entry)
            : [pasteAction("")];
          const action = items.find(
            (item) => item.type !== "separator" && item.id === operation,
          );
          if (action && action.type !== "separator") {
            event.preventDefault();
            void executeCommand({ ...action, requiresDesktop: true });
            return;
          }
        }
        if (
          entry &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey &&
          ["F2", "Delete"].includes(event.key)
        ) {
          event.preventDefault();
          const action = entryMenuItems(entry).find(
            (item) =>
              item.type !== "separator" &&
              item.id ===
                (event.key === "F2" ? "entry-rename" : "entry-delete"),
          );
          if (action && action.type !== "separator")
            void executeCommand(action);
          return;
        }
      }
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "p"
    ) {
      event.preventDefault();
      if (event.shiftKey || !useWorkspace.getState().project) openPalette();
      else setQuickOpen(true);
      return;
    }
    const command = buildPaletteCommands().find((command) =>
      matchesShortcut(command, event),
    );
    if (command) {
      event.preventDefault();
      void executeCommand(command);
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let confirming = false;
    const appWindow = getCurrentWindow();
    void appWindow
      .onCloseRequested(async (event) => {
        const state = useWorkspace.getState();
        event.preventDefault();
        if (confirming || state.busy || modalOpen.current) return;
        confirming = true;
        try {
          if (await confirmDocuments(state.documents)) {
            await useWorkspace.getState().persist();
            await useSettings.getState().flush();
            await useWorkspace.getState().flushRecovery(true);
            await appWindow.destroy();
          }
        } catch (error) {
          await useWorkspace
            .getState()
            .flushRecovery()
            .catch(() => {});
          useWorkspace.setState({ error: String(error) });
        } finally {
          confirming = false;
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch((error) => useWorkspace.setState({ error: String(error) }));
    return () => {
      disposed = true;
      stop?.();
    };
  }, [confirmDocuments]);

  return (
    <>
      <div
        className={styles.app}
        inert={Boolean(
          confirmation ||
          actionRequest ||
          palette ||
          quickOpen ||
          replaceOpen ||
          menu,
        )}
      >
        <div
          className={`${styles.workbench} ${!sidebar ? styles.sidebarHidden : ""}`}
          data-tauri-drag-region
        >
          {sidebar ? (
            <aside
              className={styles.sidebar}
              data-explorer={activity === "files" ? "true" : undefined}
              aria-label={
                activities.find((item) => item.id === activity)?.label
              }
            >
              <nav
                className={styles.activityBar}
                aria-label={t("작업 영역")}
                data-tauri-drag-region
              >
                {activities.map((item) => (
                  <button
                    key={item.id}
                    aria-label={item.label}
                    title={item.label}
                    aria-pressed={activity === item.id}
                    className={`${styles.activity} ${activity === item.id ? styles.activeActivity : ""}`}
                    onClick={() => setActivity(item.id)}
                  >
                    <Icon name={item.icon} size={19} />
                  </button>
                ))}
              </nav>
              <div className={styles.sidebarHeading}>
                <span>
                  {activity === "projects"
                    ? t("프로젝트 목록")
                    : activities.find((item) => item.id === activity)?.label}
                </span>
              </div>
              {activity === "files" ? (
                <>
                  <div className={styles.projectLabel}>
                    <span className={styles.projectIcon}>
                      <Icon name="book" size={17} />
                    </span>
                    <div>
                      <strong>{project?.name ?? t("프로젝트 없음")}</strong>
                      {!desktop ? <span>{t("브라우저 샘플")}</span> : null}
                    </div>
                  </div>
                  {!project ? (
                    <div className={styles.projectActions}>
                      <button
                        className={styles.openProjectButton}
                        disabled={busy || !desktop}
                        onClick={() => void chooseProject()}
                      >
                        <Icon name="folder" size={15} />
                        {t("폴더 열기")}
                        <span>Ctrl O</span>
                      </button>
                    </div>
                  ) : null}
                  {project ? (
                    <details
                      ref={explorerTree}
                      className={styles.treeRoot}
                      open
                      key={project.path}
                    >
                      <TreeDropTarget
                        folderPath=""
                        data-tree-path=""
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          manageExplorer(event.clientX, event.clientY);
                        }}
                      >
                        <Icon name="down" size={12} />
                        <span title={project.path}>{projectFolderName}</span>
                        {desktop ? (
                          <span
                            className={styles.explorerTools}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              title={t("새 문서")}
                              aria-label={t("새 문서")}
                              disabled={busy}
                              onClick={() => runAppCommand("new-file")}
                            >
                              <Icon name="add" size={14} />
                            </button>
                            <button
                              title={t("새 폴더")}
                              aria-label={t("새 폴더")}
                              disabled={busy}
                              onClick={() => runAppCommand("new-folder")}
                            >
                              <Icon name="folder" size={14} />
                            </button>
                            <button
                              title={t("새로고침")}
                              aria-label={t("새로고침")}
                              disabled={busy}
                              onClick={() =>
                                void useWorkspace.getState().refresh()
                              }
                            >
                              <Icon name="refresh" size={14} />
                            </button>
                          </span>
                        ) : null}
                      </TreeDropTarget>
                      <WorkspaceTree
                        onManage={manageEntry}
                        onOpen={() => setSettingsOpen(false)}
                      />
                    </details>
                  ) : (
                    <p
                      className={styles.projectNote}
                      style={{ padding: "0 16px" }}
                    >
                      {t("프로젝트 폴더를 열어 문서를 편집하세요.")}
                    </p>
                  )}
                </>
              ) : null}
              {activity === "search" ? (
                <ProjectSearch
                  onReplace={() => setReplaceOpen(true)}
                  folder={
                    searchScope?.root === project?.path ? searchScope?.path : ""
                  }
                  onClearFolder={() => setSearchScope(null)}
                  inputRef={searchInput}
                  onResult={(match) => void jump(match)}
                />
              ) : null}
              {activity === "projects" ? (
                <ProjectManager
                  onActivate={(item) => void activateProject(item)}
                  onRegister={() => void chooseProject()}
                  onManage={manageProject}
                />
              ) : null}
            </aside>
          ) : null}
          <main className={styles.main}>
            <div className={styles.tabBar}>
              <div
                className={styles.tabs}
                role="tablist"
                aria-label={t("열린 문서")}
              >
                {settingsOpen ? (
                  <div className={`${styles.tab} ${styles.activeTab}`}>
                    <button
                      role="tab"
                      aria-selected
                      id="settings-tab"
                      aria-controls="settings-panel"
                    >
                      <Icon name="settings" size={15} />
                      <span>{t("설정")}</span>
                    </button>
                    <button
                      className={styles.tabClose}
                      aria-label={t("설정 탭 닫기")}
                      onClick={() => setSettingsOpen(false)}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ) : null}
                {openTabs.map((id) => {
                  const document = documents.find((item) => item.id === id)!;
                  return (
                    <div
                      className={`${styles.tab} ${!settingsOpen && activeId === id ? styles.activeTab : ""}`}
                      key={id}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget
                          .querySelector<HTMLElement>('[role="tab"]')
                          ?.focus();
                        manageTab(id, event.clientX, event.clientY);
                      }}
                    >
                      <button
                        role="tab"
                        aria-selected={!settingsOpen && activeId === id}
                        aria-controls="document-panel"
                        id={`tab-${id}`}
                        onClick={() => openDocument(id)}
                      >
                        <FileIcon name={document.name} size={16} />
                        <span>{document.name}</span>
                      </button>
                      <button
                        className={styles.tabClose}
                        aria-label={t("{0} 탭 닫기", document.name)}
                        onClick={() => void closeDocument(id)}
                      >
                        {dirty(id) ? (
                          <span className={styles.tabDirty}>●</span>
                        ) : (
                          <Icon name="close" size={13} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                className={styles.paletteButton}
                title={t("명령 팔레트 (Ctrl Shift P)")}
                aria-label={t("명령 팔레트")}
                onClick={openPalette}
              >
                <Icon name="more" size={15} />
              </button>
              <Titlebar />
            </div>
            <div className={styles.contentPanel} aria-busy={busy}>
              {recoveryCandidates.length || recoveryError ? (
                <div className={styles.externalNotice} role="status">
                  <span>
                    {recoveryError
                      ? t(
                          "복구 데이터를 읽지 못했습니다. 기존 임시본은 보존됩니다.",
                        )
                      : t(
                          "복구 가능한 미저장 문서 {0}개",
                          String(recoveryCandidates.length),
                        )}
                  </span>
                  {!recoveryError ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void useWorkspace.getState().decideRecovery(true)
                      }
                    >
                      {t("복구")}
                    </button>
                  ) : null}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void useWorkspace.getState().decideRecovery(false)
                    }
                  >
                    {t("임시본 버리기")}
                  </button>
                </div>
              ) : null}
              {error ? (
                <div className={styles.workspaceError} role="alert">
                  <span>{translateError(error)}</span>
                  <button aria-label={t("알림 닫기")} onClick={clearError}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : null}
              {settingsOpen ? (
                <div
                  id="settings-panel"
                  role="tabpanel"
                  aria-labelledby="settings-tab"
                  className={styles.settingsContainer}
                >
                  <SettingsPanel />
                </div>
              ) : activeDocument ? (
                <>
                  <div className={styles.documentToolbar}>
                    <div className={styles.breadcrumb}>
                      <Icon name="book" size={13} />
                      <span>{project?.name ?? t("작업 공간")}</span>
                      <Icon name="chevron" size={11} />
                      {activeDocument.folder ? (
                        <>
                          <span>{activeDocument.folder}</span>
                          <Icon name="chevron" size={11} />
                        </>
                      ) : null}
                      <strong>{activeDocument.name}</strong>
                    </div>
                    <div className={styles.documentTools}>
                      <button
                        className={styles.toolButton}
                        aria-label={t("문서 내 찾기")}
                        title={t("찾기 (Ctrl F)")}
                        onClick={() => runAppCommand("find")}
                      >
                        <Icon name="search" size={14} />
                      </button>
                      <button
                        className={styles.toolButton}
                        aria-label={t("바꾸기")}
                        title={t("바꾸기 (Ctrl H)")}
                        onClick={() => runAppCommand("replace")}
                      >
                        <Icon name="code" size={14} />
                      </button>
                      <button
                        className={styles.toolButton}
                        aria-label={t("실행 취소")}
                        title={t("실행 취소 (Ctrl Z)")}
                        disabled={busy}
                        onClick={() => editorAction("undo")}
                      >
                        <Icon name="undo" size={14} />
                      </button>
                      <button
                        className={styles.toolButton}
                        aria-label={t("다시 실행")}
                        title={t("다시 실행 (Ctrl Y)")}
                        disabled={busy}
                        onClick={() => editorAction("redo")}
                      >
                        <Icon
                          name="undo"
                          size={14}
                          style={{ transform: "scaleX(-1)" }}
                        />
                      </button>
                      <button
                        className={styles.toolButton}
                        aria-label={t("문서 개요")}
                        title={t("문서 개요")}
                        ref={outlineTrigger}
                        aria-pressed={layout.outline}
                        aria-expanded={layout.outline}
                        aria-controls="document-outline"
                        onClick={() =>
                          useWorkspace
                            .getState()
                            .setLayout({ outline: !layout.outline })
                        }
                      >
                        <Icon name="outline" size={14} />
                      </button>
                      <button
                        className={styles.toolButton}
                        aria-label={t("스크롤 동기화")}
                        title={t("스크롤 동기화")}
                        aria-pressed={layout.sync}
                        onClick={() =>
                          useWorkspace
                            .getState()
                            .setLayout({ sync: !layout.sync })
                        }
                      >
                        <Icon name="sync" size={14} />
                      </button>
                      <button
                        className={styles.toolButton}
                        disabled={busy || !desktop}
                        aria-label={t("다른 이름으로 저장")}
                        title={t("다른 이름으로 저장 (Ctrl Shift S)")}
                        onClick={() => runAppCommand("save-as")}
                      >
                        <Icon name="save" size={14} />
                      </button>
                      <button
                        className={styles.saveButton}
                        disabled={busy || !desktop || !isDirty(activeDocument)}
                        onClick={() => runAppCommand("save")}
                        title={t("저장 (Ctrl S)")}
                      >
                        <Icon name="save" size={15} />
                        <span>{t("저장")}</span>
                      </button>
                      <div
                        className={styles.viewSwitch}
                        aria-label={t("문서 보기 방식")}
                      >
                        {views.map((item) => (
                          <button
                            key={item.id}
                            className={
                              view === item.id ? styles.activeView : ""
                            }
                            aria-label={item.label}
                            title={item.label}
                            aria-pressed={view === item.id}
                            onClick={() => setView(item.id)}
                          >
                            <Icon name={item.icon} size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {activeDocument.diskContent !== undefined ? (
                    <div className={styles.externalNotice} role="status">
                      <span>
                        {t(
                          activeDocument.diskContent === null
                            ? "파일이 삭제되었거나 읽을 수 없습니다. 편집 내용은 유지됩니다."
                            : "파일이 외부에서 변경되었습니다.",
                        )}
                      </span>
                      {typeof activeDocument.diskContent === "string" ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void resolveDiskChange(activeDocument.id, true)
                            }
                          >
                            {t("다시 읽기")}
                          </button>
                          <button
                            disabled={busy}
                            title={t(
                              "내 편집을 유지하고 다음 저장 시 외부 내용을 덮어씁니다.",
                            )}
                            onClick={() =>
                              void resolveDiskChange(activeDocument.id, false)
                            }
                          >
                            {t("내 편집 유지")}
                          </button>
                        </>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void useWorkspace
                              .getState()
                              .saveAs(activeDocument.id)
                          }
                        >
                          {t("다른 이름으로 저장")}
                        </button>
                      )}
                    </div>
                  ) : null}
                  <div className={styles.documentBody}>
                    <div
                      id="document-panel"
                      role="tabpanel"
                      aria-labelledby={`tab-${activeDocument.id}`}
                      className={`${styles.documentArea} ${view === "split" ? styles.splitView : ""}`}
                    >
                      {view !== "preview" ? (
                        <section
                          className={styles.editorPane}
                          aria-label={t("편집 영역")}
                        >
                          <div className={styles.paneLabel}>
                            <span>MARKDOWN</span>
                            <span>{t("편집")}</span>
                          </div>
                          <div className={styles.editorContent}>
                            <Suspense
                              fallback={
                                <div className={styles.loading}>
                                  {t("편집기 준비 중…")}
                                </div>
                              }
                            >
                              <MarkdownEditor
                                onContextMenu={manageEditor}
                                documentId={activeDocument.id}
                                projectPath={project?.path}
                                command={command}
                                onCommandHandled={clearCommand}
                                navigation={
                                  navigation?.documentId === activeDocument.id
                                    ? navigation
                                    : undefined
                                }
                                syncTarget={
                                  layout.sync &&
                                  scrollTarget?.documentId === activeDocument.id
                                    ? scrollTarget
                                    : undefined
                                }
                                onScrollLine={(line, edge) =>
                                  scroll("editor", line, edge)
                                }
                                value={activeDocument.content}
                                readOnly={
                                  busy ||
                                  recoveryCandidates.length > 0 ||
                                  Boolean(recoveryError)
                                }
                                onChange={(content) =>
                                  edit(activeDocument.id, content)
                                }
                                onCursor={(line, column) =>
                                  setCursor({ line, column })
                                }
                              />
                            </Suspense>
                          </div>
                        </section>
                      ) : null}
                      {view !== "edit" ? (
                        <section
                          className={styles.previewPane}
                          aria-label={t("미리보기 영역")}
                        >
                          <div className={styles.paneLabel}>
                            <span>PREVIEW</span>
                            <span>
                              <i className={styles.liveDot} />
                              {t("실시간 미리보기")}
                            </span>
                          </div>
                          <Suspense
                            fallback={
                              <div className={styles.loading}>
                                {t("미리보기 준비 중…")}
                              </div>
                            }
                          >
                            <MarkdownPreview
                              content={deferredContent}
                              documentPath={activeDocument.id}
                              root={project?.path}
                              desktop={desktop}
                              onNavigate={(target) => void followLink(target)}
                              navigation={
                                navigation?.documentId === activeDocument.id
                                  ? navigation
                                  : undefined
                              }
                              syncTarget={
                                layout.sync &&
                                scrollTarget?.documentId === activeDocument.id
                                  ? scrollTarget
                                  : undefined
                              }
                              onScrollLine={(line, edge) =>
                                scroll("preview", line, edge)
                              }
                            />
                          </Suspense>
                        </section>
                      ) : null}
                    </div>
                    {layout.outline ? (
                      <aside
                        id="document-outline"
                        className={styles.outlinePanel}
                        aria-label={t("문서 개요")}
                      >
                        <div className={styles.outlineHeading}>
                          <h2>{t("문서 개요")}</h2>
                          <button
                            type="button"
                            aria-label={t("문서 개요 닫기")}
                            title={`${t("문서 개요 닫기")} (Esc)`}
                            onClick={closeOutline}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                        {outlineHeadings.map((heading) => (
                          <button
                            key={heading.id}
                            style={{
                              paddingLeft: 10 + (heading.depth - 1) * 10,
                            }}
                            onClick={() =>
                              setNavigation({
                                documentId: activeDocument.id,
                                line: heading.line,
                                column: 1,
                                token: Date.now(),
                              })
                            }
                          >
                            {heading.title}
                          </button>
                        ))}
                        {!outlineHeadings.length ? (
                          <p>{t("제목이 없습니다.")}</p>
                        ) : null}
                      </aside>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className={styles.emptyWorkspace}>
                  <span className={styles.emptyMark}>o.</span>
                  <h1>
                    {project ? t("열린 문서 없음") : t("생각이 머무는 공간")}
                  </h1>
                  <p>
                    {project
                      ? t("탐색기에서 문서를 선택해 시작하세요.")
                      : t("프로젝트 폴더를 열어 시작하세요.")}
                  </p>
                  <button
                    disabled={busy || (!project && !desktop)}
                    onClick={() => {
                      if (!project) void chooseProject();
                      else if (desktop) void createEntry("", false);
                      else {
                        setActivity("search");
                        setSidebar(true);
                        requestAnimationFrame(() =>
                          searchInput.current?.focus(),
                        );
                      }
                    }}
                  >
                    {project
                      ? desktop
                        ? t("새 문서")
                        : t("문서 검색")
                      : t("프로젝트 폴더 열기")}
                    <Icon name="chevron" size={14} />
                  </button>
                  {project ? (
                    <span>
                      <kbd>Ctrl K</kbd>
                      {t("문서 검색")}
                    </span>
                  ) : null}
                </div>
              )}
              {!desktop && sampleNotice ? (
                <div className={styles.sampleNotice}>
                  <Icon name="book" size={14} />
                  <span>
                    {t(
                      "샘플 작업 공간을 둘러보고 있어요. 변경 내용은 이번 실행 동안만 유지됩니다.",
                    )}
                  </span>
                  <button
                    aria-label={t("샘플 안내 닫기")}
                    onClick={() => setSampleNotice(false)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ) : null}
            </div>
          </main>
        </div>
        <footer className={styles.statusbar}>
          <div className={styles.statusLeft}>
            <button
              className={styles.sidebarToggle}
              aria-label={t("설정")}
              title={t("설정 (Ctrl ,)")}
              onClick={() => setSettingsOpen(true)}
            >
              <Icon name="settings" size={14} />
            </button>
            <button
              className={styles.sidebarToggle}
              aria-label={sidebar ? t("사이드바 닫기") : t("사이드바 열기")}
              aria-expanded={sidebar}
              title={`${sidebar ? t("사이드바 닫기") : t("사이드바 열기")} (Ctrl B)`}
              onClick={() => setSidebar((value) => !value)}
            >
              <Icon name="panel" size={14} />
            </button>
            <span className={styles.statusProject}>
              <Icon name="projects" size={13} />
              {project?.name ?? t("프로젝트 없음")}
            </span>
            {busy || documents.some(isDirty) ? (
              <span className={styles.statusMessage}>
                <Icon name="check" size={12} />
                {busy ? t("처리 중…") : t("저장하지 않은 변경 있음")}
              </span>
            ) : null}
          </div>
          <div className={styles.statusRight}>
            {activeDocument ? (
              <>
                <span>{t("줄 {0}, 열 {1}", cursor.line, cursor.column)}</span>
                <span className={styles.optionalStatus}>UTF-8</span>
                <span className={styles.optionalStatus}>{t("공백: 2")}</span>
                <span>
                  <Icon name="markdown" size={13} />
                  Markdown
                </span>
              </>
            ) : (
              <span>{t("열린 문서 없음")}</span>
            )}
          </div>
        </footer>
      </div>
      {actionRequest ? (
        <ActionDialog request={actionRequest} onResolve={resolveAction} />
      ) : null}
      {palette ? (
        <CommandPalette
          suspended={Boolean(menu)}
          commands={paletteCommands}
          onClose={() => setPalette(false)}
        />
      ) : null}
      {quickOpen && project ? (
        <QuickOpen
          key={project.path}
          root={project.path}
          suspended={Boolean(menu)}
          onClose={() => setQuickOpen(false)}
        />
      ) : null}
      {replaceOpen && project ? (
        <ProjectReplace
          key={project.path}
          root={project.path}
          suspended={Boolean(menu)}
          onClose={() => setReplaceOpen(false)}
        />
      ) : null}
      {menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null}
      {confirmation ? (
        <UnsavedDialog
          names={confirmation.names}
          onChoose={resolveConfirmation}
        />
      ) : null}
    </>
  );
}
