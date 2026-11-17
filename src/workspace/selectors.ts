import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import type { TextStats } from "./textStats";
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

/** Above this size the preview and outline wait for a pause in typing. */
const LARGE_DOCUMENT_CHARS = 100_000;
const LARGE_DOCUMENT_DELAY_MS = 200;

/** Document content for derived views, debounced for large documents. */
export function useSettledContent(id: string) {
  const content = useDocumentContent(id);
  const large = content.length >= LARGE_DOCUMENT_CHARS;
  const [settled, setSettled] = useState({ id, content });
  useEffect(() => {
    if (!large) return;
    const timer = setTimeout(
      () => setSettled({ id, content }),
      LARGE_DOCUMENT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [id, content, large]);
  const value = large && settled.id === id ? settled.content : content;
  // Defer only edits of the same document. A deferred value from another
  // document would render the new path with the old content and keep the old
  // document's background rendering ahead of the new one.
  const current = useMemo(() => ({ id, value }), [id, value]);
  const deferred = useDeferredValue(current);
  return deferred.id === id ? deferred.value : value;
}

/** Editor cursor position and selection counts, kept outside the workspace
 * store to isolate updates. */
export const useCursor = create<{
  line: number;
  column: number;
  /** Counts of the selected text, or `null` without a selection. */
  selection: TextStats | null;
}>(() => ({ line: 1, column: 1, selection: null }));
