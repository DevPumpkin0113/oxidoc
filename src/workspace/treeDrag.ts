import type { DragEvent as ReactDragEvent } from "react";
import { create } from "zustand";
import { useWorkspace } from "./store";
import type { Entry } from "./api";

export const dragType = "application/x-oxidoc-file";
export interface DragSource {
  root: string;
  path: string;
}
export const useTreeDrag = create<{
  source: DragSource | null;
  over: string | null;
}>(() => ({
  source: null,
  over: null,
}));

export function endFileDrag() {
  useTreeDrag.setState({ source: null, over: null });
}
export function startFileDrag(event: ReactDragEvent, entry: Entry) {
  const { desktop, busy, project } = useWorkspace.getState();
  if (!desktop || busy || !project || entry.isDirectory) {
    event.preventDefault();
    return;
  }
  const source = { root: project.path, path: entry.path };
  event.dataTransfer.setData(dragType, JSON.stringify(source));
  event.dataTransfer.effectAllowed = "move";
  useTreeDrag.setState({ source, over: null });
}

// WebView2 otherwise opens dropped OS files after enabling HTML drag and drop.
export function blockExternalFileDrop(event: DragEvent) {
  if (
    !event.dataTransfer ||
    !Array.from(event.dataTransfer.types).includes("Files")
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "none";
}
