import type { PaletteCommand } from "../components/CommandPalette";
import { t } from "../settings/i18n";
import { executeCommand, type CommandTarget } from "../workspace/commands";
import { useWorkspace } from "../workspace/store";
import {
  activateProject,
  chooseProject,
  closeDocuments,
  createEntry,
  editorAction,
  openDocument,
  revealDocument,
  saveAll,
  searchFolder,
  setSettingsOpen,
  setSidebar,
  toggleOutline,
} from "./actions";
import { useUi } from "./uiStore";

/** App commands for the palette, shortcuts and menus, built from current state. */
export function buildPaletteCommands(): PaletteCommand[] {
  const { project, desktop, projects, documents, activeId } =
    useWorkspace.getState();
  const { settingsOpen } = useUi.getState();
  const activeDocument = documents.find((document) => document.id === activeId);
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
      run: () => useUi.setState({ quickOpen: true }),
    },
    {
      id: "replace-project",
      label: t("프로젝트 전체 바꾸기"),
      shortcut: "Ctrl+Shift+H",
      requiresDesktop: true,
      enabled: () => Boolean(useWorkspace.getState().project),
      run: () => useUi.setState({ replaceOpen: true }),
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
      run: () => searchFolder(""),
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
            run: () => useWorkspace.getState().save(activeDocument.id),
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
            run: toggleOutline,
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
      enabled: () => settingsOpen || Boolean(useWorkspace.getState().activeId),
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
      useUi.setState({ palette: false });
      return item.run();
    },
  }));
}

export function runAppCommand(id: string) {
  const command = buildPaletteCommands().find((command) => command.id === id);
  if (command) void executeCommand(command);
}

export function openPalette() {
  useUi.setState({ paletteCommands: buildPaletteCommands(), palette: true });
}
