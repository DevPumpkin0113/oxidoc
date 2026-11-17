import type { MenuItem } from "../components/ContextMenu";
import { t } from "../settings/i18n";
import { executeCommand, matchesShortcut } from "../workspace/commands";
import { sameDocumentPath, useWorkspace } from "../workspace/store";
import { copyText, inputMenu } from "../workspace/textContext";
import { closeOutline } from "./actions";
import { showContext } from "./dialogs";
import {
  entryClipboardActions,
  entryMenuItems,
  manageExplorer,
  pasteAction,
} from "./menus";
import { buildPaletteCommands, openPalette } from "./paletteCommands";
import { isModalOpen, useUi } from "./uiStore";

/** Replaces the WebView context menu with app menus. */
export function handleContextMenu(event: MouseEvent) {
  event.preventDefault();
  const ui = useUi.getState();
  if (ui.menu || !(event.target instanceof Element)) return;
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
  if (isModalOpen(ui)) return;
  if (target.closest('[data-explorer="true"]') && !target.closest("nav")) {
    manageExplorer(event.clientX, event.clientY);
    return;
  }
  const selection = window.getSelection()?.toString() ?? "";
  const projectPanel = Boolean(target.closest("[data-projects-panel]"));
  const ids =
    projectPanel || !useWorkspace.getState().project
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
    projectPanel ? t("프로젝트") : "Oxidoc",
    items,
    event.clientX,
    event.clientY,
  );
}

const plainKey = (event: KeyboardEvent) =>
  !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

/** Explorer clipboard, rename and delete keys on a focused tree row. */
function handleExplorerKey(event: KeyboardEvent, element: HTMLElement) {
  const path =
    element.closest<HTMLElement>("[data-tree-path]")?.dataset.treePath;
  if (path === undefined) return false;
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
    const items = entry ? entryClipboardActions(entry) : [pasteAction("")];
    const action = items.find(
      (item) => item.type !== "separator" && item.id === operation,
    );
    if (action && action.type !== "separator") {
      event.preventDefault();
      void executeCommand({ ...action, requiresDesktop: true });
      return true;
    }
  }
  if (entry && plainKey(event) && ["F2", "Delete"].includes(event.key)) {
    event.preventDefault();
    const id = event.key === "F2" ? "entry-rename" : "entry-delete";
    const action = entryMenuItems(entry).find(
      (item) => item.type !== "separator" && item.id === id,
    );
    if (action && action.type !== "separator") void executeCommand(action);
    return true;
  }
  return false;
}

export function handleKeydown(event: KeyboardEvent) {
  const modal = isModalOpen(useUi.getState());
  if (
    event.key === "Escape" &&
    useWorkspace.getState().layout.outline &&
    !modal &&
    !event.isComposing &&
    !event.defaultPrevented
  ) {
    event.preventDefault();
    closeOutline();
    return;
  }
  if (modal || event.isComposing || event.defaultPrevented) return;
  const element = event.target instanceof HTMLElement ? event.target : null;
  if (
    element?.closest('[data-explorer="true"]') &&
    !element.closest(
      'input,textarea,[contenteditable="true"],.monaco-editor',
    ) &&
    handleExplorerKey(event, element)
  )
    return;
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "p"
  ) {
    event.preventDefault();
    if (event.shiftKey || !useWorkspace.getState().project) openPalette();
    else useUi.setState({ quickOpen: true });
    return;
  }
  const command = buildPaletteCommands().find((command) =>
    matchesShortcut(command, event),
  );
  if (command) {
    event.preventDefault();
    void executeCommand(command);
  }
}
