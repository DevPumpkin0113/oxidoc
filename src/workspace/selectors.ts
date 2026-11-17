import { useRef } from "react";
import { create } from "zustand";
import { isDirty, useWorkspace, type Document } from "./store";

/** Document fields that change on save/disk events, not on every keystroke. */
export interface DocumentSummary {
  id: string;
  name: string;
  folder: string;
  dirty: boolean;
  /** `undefined`: in sync, `"changed"`: changed on disk, `null`: missing on disk. */
  disk?: "changed" | null;
}

const summarize = (document: Document): DocumentSummary => ({
  id: document.id,
  name: document.name,
  folder: document.folder,
  dirty: isDirty(document),
  disk:
    document.diskContent === undefined
      ? undefined
      : document.diskContent === null
        ? null
        : "changed",
});

const sameSummary = (a: DocumentSummary, b: DocumentSummary) =>
  a.id === b.id &&
  a.name === b.name &&
  a.folder === b.folder &&
  a.dirty === b.dirty &&
  a.disk === b.disk;

/** Open documents without content; keeps the same array while summaries are equal. */
export function useDocumentSummaries(): DocumentSummary[] {
  const previous = useRef<DocumentSummary[]>([]);
  return useWorkspace((state) => {
    const next = state.documents.map(summarize);
    const current = previous.current;
    if (
      next.length === current.length &&
      next.every((summary, index) => sameSummary(summary, current[index]))
    )
      return current;
    previous.current = next;
    return next;
  });
}

export function useDocumentContent(id: string) {
  return useWorkspace(
    (state) =>
      state.documents.find((document) => document.id === id)?.content ?? "",
  );
}

/** Editor cursor position, kept outside the workspace store to isolate updates. */
export const useCursor = create(() => ({ line: 1, column: 1 }));
