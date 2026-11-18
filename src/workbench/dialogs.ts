import type { ActionRequest } from "../components/ActionDialog";
import type { MenuItem } from "../components/ContextMenu";
import type { UnsavedChoice } from "../components/UnsavedDialog";
import { isDirty, useWorkspace, type Document } from "../workspace/store";
import { pendingChoice, useUi } from "./uiStore";

export function requestAction(request: Omit<ActionRequest, "resolve">) {
  return new Promise<string | null>((resolve) =>
    useUi.setState({ actionRequest: { ...request, resolve } }),
  );
}

export function resolveAction(value: string | null) {
  useUi.getState().actionRequest?.resolve(value);
  useUi.setState({ actionRequest: null });
}

/** Asks to save or discard modified targets; resolves false when cancelled. */
/** Asks to save or discard the named unsaved documents; none needs no answer. */
export async function askUnsaved(names: string[]): Promise<UnsavedChoice> {
  if (!names.length) return "discard";
  pendingChoice.current ??= new Promise<UnsavedChoice>((resolve) =>
    useUi.setState({ confirmation: { names, resolve } }),
  );
  return pendingChoice.current;
}

export async function confirmDocuments(targets: Document[]) {
  const modified = targets.filter(isDirty);
  if (!modified.length) return true;
  const choice = await askUnsaved(modified.map((document) => document.name));
  if (choice === "cancel") return false;
  if (choice === "save")
    for (const document of modified)
      if (!(await useWorkspace.getState().save(document.id))) return false;
  return true;
}

export function resolveConfirmation(choice: UnsavedChoice) {
  useUi.getState().confirmation?.resolve(choice);
  pendingChoice.current = null;
  useUi.setState({ confirmation: null });
}

const focusedElement = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null;

export function showContext(
  title: string,
  items: MenuItem[],
  x: number,
  y: number,
  returnFocus?: HTMLElement,
) {
  useUi.setState({
    menu: { title, items, x, y, returnFocus: returnFocus ?? focusedElement() },
  });
}
