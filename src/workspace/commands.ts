import type { IconName } from "../components/Icon";
import { sameDocumentPath, useWorkspace } from "./store";

export type CommandTarget =
  | { kind: "entry"; root: string; path: string }
  | { kind: "document"; root: string; id: string; active?: boolean }
  | { kind: "project"; path: string };
export interface Action {
  id?: string;
  type?: "action";
  label: string;
  run: () => void | Promise<unknown>;
  disabled?: boolean;
  enabled?: () => boolean;
  target?: CommandTarget;
  requiresDesktop?: boolean;
  allowBusy?: boolean;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  checked?: boolean;
}
export interface Command extends Action {
  id: string;
  detail?: string;
}
export type MenuItem = Action | { type: "separator"; id: string };

export function canExecuteCommand(action: Action): boolean {
  const state = useWorkspace.getState();
  if (
    action.disabled ||
    (!action.allowBusy && state.busy) ||
    (action.requiresDesktop && !state.desktop) ||
    action.enabled?.() === false
  )
    return false;
  const target = action.target;
  if (!target) return true;
  if (target.kind === "project")
    return state.projects.some((project) => project.path === target.path);
  if (state.project?.path !== target.root) return false;
  return target.kind === "document"
    ? (!target.active ||
        (state.activeId !== null &&
          sameDocumentPath(state.activeId, target.id))) &&
        state.documents.some((document) =>
          sameDocumentPath(document.id, target.id),
        )
    : Object.values(state.tree).some((entries) =>
        entries.some((entry) => sameDocumentPath(entry.path, target.path)),
      );
}
export async function executeCommand(action: Action): Promise<boolean> {
  try {
    if (!canExecuteCommand(action)) return false;
    await action.run();
    return true;
  } catch (error) {
    useWorkspace.setState({ error: String(error) });
    return false;
  }
}
export function scopeMenu(
  items: MenuItem[],
  target: CommandTarget,
): MenuItem[] {
  return items.map((item) =>
    item.type === "separator"
      ? item
      : { ...item, target, requiresDesktop: true },
  );
}
export function matchesShortcut(action: Action, event: KeyboardEvent): boolean {
  if (!action.shortcut || event.isComposing || event.defaultPrevented)
    return false;
  const parts = action.shortcut
    .toLowerCase()
    .trim()
    .split(/[+\s]+/);
  const key = parts.pop();
  return (
    event.key.toLowerCase() === key &&
    Boolean(event.ctrlKey || event.metaKey) === parts.includes("ctrl") &&
    event.shiftKey === parts.includes("shift") &&
    event.altKey === parts.includes("alt")
  );
}
