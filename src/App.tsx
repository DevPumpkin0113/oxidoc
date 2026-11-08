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
import { headings, type LinkTarget } from "./workspace/markdown";
import type { Navigation, ScrollTarget } from "./components/MarkdownPreview";
import type { EditorCommand } from "./components/MarkdownEditor";
import styles from "./App.module.css";
import SettingsPanel from "./components/SettingsPanel";
import {
  effectiveLanguage,
  effectiveTheme,
  useSettings,
} from "./settings/store";
import { themeVariables } from "./settings/themes";

const MarkdownEditor = lazy(() => import("./components/MarkdownEditor"));
const MarkdownPreview = lazy(() => import("./components/MarkdownPreview"));
type Activity = "files" | "search" | "projects";
type View = "edit" | "split" | "preview";
export default function App() {
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
  const [paletteCommands, setPaletteCommands] = useState<PaletteCommand[]>([]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
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
  function openDocument(id: string) {
    setSettingsOpen(false);
    const document = documents.find((document) => document.id === id);
    if (document)
      void open({ path: id, name: document.name, isDirectory: false });
  }

  useEffect(() => {
    modalOpen.current = Boolean(
      confirmation || actionRequest || palette || menu,
    );
  }, [confirmation, actionRequest, palette, menu]);
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
    setCommand({ id, token: Date.now() });
  }
  async function createEntry(parent: string, directory: boolean) {
    const name = await requestAction({
      title: directory ? t("새 폴더 이름") : t("새 문서 이름"),
      input: true,
      initial: directory ? t("새 폴더") : t("새 문서.md"),
      label: t("만들기"),
    });
    if (name !== null)
      await useWorkspace.getState().createEntry(parent, name, directory);
    if (name !== null && !directory) setSettingsOpen(false);
  }
  function manageEntry(entry: Entry, x: number, y: number) {
    const items: MenuItem[] = [];
    if (entry.isDirectory) {
      items.push(
        { label: t("새 문서"), run: () => void createEntry(entry.path, false) },
        { label: t("새 폴더"), run: () => void createEntry(entry.path, true) },
      );
    }
    items.push(
      {
        label: t("이름 변경"),
        run: () =>
          void (async () => {
            const name = await requestAction({
              title: t("이름 변경"),
              initial: entry.name,
              input: true,
            });
            if (name !== null)
              await useWorkspace.getState().renameEntry(entry.path, name);
          })(),
      },
      {
        label: t("휴지통으로 이동"),
        run: () =>
          void (async () => {
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
            if (confirm) await useWorkspace.getState().trashEntry(entry.path);
          })(),
      },
    );
    setMenu({ x, y, items });
  }
  function manageProject(item: Project, x: number, y: number) {
    setMenu({
      x,
      y,
      items: [
        {
          label: t("이름 변경"),
          run: () =>
            void (async () => {
              const name = await requestAction({
                title: t("프로젝트 이름 변경"),
                initial: item.name,
                input: true,
              });
              if (name !== null)
                await useWorkspace
                  .getState()
                  .updateProject(item.path, { name });
            })(),
        },
        {
          label: t("태그 편집"),
          run: () =>
            void (async () => {
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
            })(),
        },
        {
          label: t("폴더 경로 다시 연결"),
          run: () =>
            void (async () => {
              if (
                project?.path === item.path &&
                !(await confirmDocuments(documents))
              )
                return;
              await useWorkspace.getState().relocateProject(item.path);
            })(),
        },
        {
          label: t("목록에서 제거"),
          run: () =>
            void (async () => {
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
            })(),
        },
      ],
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
    return [
      {
        id: "settings",
        label: t("설정"),
        detail: "Ctrl ,",
        run: () => setSettingsOpen(true),
      },
      {
        id: "open",
        label: t("프로젝트 폴더 열기"),
        detail: "Ctrl O",
        run: () => void chooseProject(),
      },
      {
        id: "sidebar",
        label: t("사이드바 표시/숨기기"),
        detail: "Ctrl B",
        run: () => setSidebar((value) => !value),
      },
      {
        id: "search",
        label: t("프로젝트 전체 검색"),
        detail: "Ctrl K",
        run: () => {
          setActivity("search");
          setSidebar(true);
          requestAnimationFrame(() => searchInput.current?.focus());
        },
      },
      ...(project && desktop
        ? [
            {
              id: "new-file",
              label: t("새 문서"),
              run: () => void createEntry("", false),
            },
            {
              id: "new-folder",
              label: t("새 폴더"),
              run: () => void createEntry("", true),
            },
          ]
        : []),
      ...(activeDocument
        ? [
            {
              id: "save",
              label: t("문서 저장"),
              detail: "Ctrl S",
              run: () => void save(activeDocument.id),
            },
            {
              id: "save-as",
              label: t("다른 이름으로 저장"),
              detail: "Ctrl Shift S",
              run: () => void useWorkspace.getState().saveAs(activeDocument.id),
            },
            {
              id: "find",
              label: t("문서 내 찾기"),
              detail: "Ctrl F",
              run: () => editorAction("find"),
            },
            {
              id: "replace",
              label: t("문서 내 바꾸기"),
              detail: "Ctrl H",
              run: () => editorAction("replace"),
            },
            {
              id: "outline",
              label: t("문서 개요 표시/숨기기"),
              run: () =>
                useWorkspace.getState().setLayout({ outline: !layout.outline }),
            },
          ]
        : []),
      ...projects.map((item, index) => ({
        id: `project-${index}`,
        label: t("프로젝트 열기: {0}", item.name),
        detail: item.path,
        run: () => void activateProject(item),
      })),
      ...documents.map((document, index) => ({
        id: `document-${index}`,
        label: t("문서 전환: {0}", document.name),
        detail: document.folder,
        run: () => openDocument(document.id),
      })),
    ].map((item) => ({
      ...item,
      run: () => {
        setPalette(false);
        item.run();
      },
    }));
  }
  function openPalette() {
    setPaletteCommands(buildPaletteCommands());
    setPalette(true);
  }

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
      (event.ctrlKey || event.metaKey) &&
      event.key === "," &&
      !event.altKey &&
      !modalOpen.current
    ) {
      event.preventDefault();
      setSettingsOpen(true);
      return;
    }
    if (
      !modalOpen.current &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        const state = useWorkspace.getState();
        if (state.activeId) void state.saveAs(state.activeId);
        return;
      }
      if (key === "f" || key === "h") {
        event.preventDefault();
        if (useWorkspace.getState().activeId) {
          editorAction(key === "f" ? "find" : "replace");
        }
        return;
      }
    }
    if (
      modalOpen.current ||
      confirmation ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const key = event.key.toLowerCase();
    if (key === "k") {
      event.preventDefault();
      setActivity("search");
      setSidebar(true);
      requestAnimationFrame(() => searchInput.current?.focus());
    }
    if (key === "b") {
      event.preventDefault();
      setSidebar((value) => !value);
    }
    if (key === "s") {
      event.preventDefault();
      const state = useWorkspace.getState();
      if (state.activeId) void state.save(state.activeId);
    }
    if (key === "o") {
      event.preventDefault();
      void chooseProject();
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
            await appWindow.destroy();
          }
        } catch (error) {
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
        inert={Boolean(confirmation || actionRequest || palette || menu)}
      >
        <div
          className={`${styles.workbench} ${!sidebar ? styles.sidebarHidden : ""}`}
          data-tauri-drag-region
        >
          {sidebar ? (
            <aside
              className={styles.sidebar}
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
                      className={styles.treeRoot}
                      open
                      key={project.path}
                    >
                      <summary>
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
                              onClick={() => void createEntry("", false)}
                            >
                              <Icon name="add" size={14} />
                            </button>
                            <button
                              title={t("새 폴더")}
                              aria-label={t("새 폴더")}
                              disabled={busy}
                              onClick={() => void createEntry("", true)}
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
                      </summary>
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
                        onClick={() => editorAction("find")}
                      >
                        <Icon name="search" size={14} />
                      </button>
                      <button
                        className={styles.toolButton}
                        aria-label={t("바꾸기")}
                        title={t("바꾸기 (Ctrl H)")}
                        onClick={() => editorAction("replace")}
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
                        onClick={() =>
                          void useWorkspace.getState().saveAs(activeDocument.id)
                        }
                      >
                        <Icon name="save" size={14} />
                      </button>
                      <button
                        className={styles.saveButton}
                        disabled={busy || !desktop || !isDirty(activeDocument)}
                        onClick={() => void save(activeDocument.id)}
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
                                readOnly={busy}
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
          commands={paletteCommands}
          onClose={() => setPalette(false)}
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
