import { lazy, useCallback, useEffect, useMemo } from "react";
import type { ComponentProps } from "react";
import { t } from "../settings/i18n";
import { effectiveLanguage, useSettings } from "../settings/store";
import { isMermaidFile } from "../workspace/documentTypes";
import { headings } from "../workspace/markdown";
import { countText } from "../workspace/textStats";
import { useWorkspace } from "../workspace/store";
import {
  useCursor,
  useDocumentContent,
  useSettledContent,
} from "../workspace/selectors";

const MarkdownEditor = lazy(() => import("./MarkdownEditor"));
const MarkdownPreview = lazy(() => import("./MarkdownPreview"));

// Each pane subscribes to document content itself so typing re-renders only
// the panes, not the whole workspace.

type EditorProps = Omit<
  ComponentProps<typeof MarkdownEditor>,
  "value" | "onChange" | "onCursor"
>;

export function DocumentEditor(props: EditorProps) {
  const { documentId } = props;
  const value = useDocumentContent(documentId);
  const onChange = useCallback(
    (content: string) => useWorkspace.getState().edit(documentId, content),
    [documentId],
  );
  // A hidden editor (preview-only view) has no selection to report.
  useEffect(() => () => setSelection(""), []);
  return (
    <MarkdownEditor
      {...props}
      value={value}
      onChange={onChange}
      onCursor={setCursor}
      onSelection={setSelection}
    />
  );
}

const setCursor = (line: number, column: number) =>
  useCursor.setState({ line, column });
const setSelection = (text: string) =>
  useCursor.setState({ selection: text ? countText(text) : null });

type PreviewProps = Omit<ComponentProps<typeof MarkdownPreview>, "content">;

export function DocumentPreview(props: PreviewProps) {
  const content = useSettledContent(props.documentPath ?? "");
  return <MarkdownPreview {...props} content={content} />;
}

export function OutlineList({
  documentId,
  onSelect,
}: {
  documentId: string;
  onSelect: (line: number) => void;
}) {
  const content = useSettledContent(documentId);
  const items = useMemo(
    () => (isMermaidFile(documentId) ? [] : headings(content)),
    [content, documentId],
  );
  if (!items.length) return <p>{t("제목이 없습니다.")}</p>;
  return items.map((heading) => (
    <button
      key={heading.id}
      style={{ paddingLeft: 10 + (heading.depth - 1) * 10 }}
      onClick={() => onSelect(heading.line)}
    >
      {heading.title}
    </button>
  ));
}

/** Character and word counts of the selection, or of the document. */
export function TextStatus({ documentId }: { documentId: string }) {
  const content = useSettledContent(documentId);
  const total = useMemo(() => countText(content), [content]);
  const selection = useCursor((state) => state.selection);
  const language = useSettings(effectiveLanguage);
  const format = (count: number) => count.toLocaleString(language);
  const stats = selection ?? total;
  return (
    <span>
      {t(
        selection ? "선택 {0}자 · {1}단어" : "{0}자 · {1}단어",
        format(stats.characters),
        format(stats.words),
      )}
    </span>
  );
}

export function CursorStatus() {
  const line = useCursor((state) => state.line);
  const column = useCursor((state) => state.column);
  return <span>{t("줄 {0}, 열 {1}", line, column)}</span>;
}
