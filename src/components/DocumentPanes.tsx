import { lazy, useCallback, useDeferredValue, useMemo } from "react";
import type { ComponentProps } from "react";
import { t } from "../settings/i18n";
import { isMermaidFile } from "../workspace/documentTypes";
import { headings } from "../workspace/markdown";
import { useWorkspace } from "../workspace/store";
import { useCursor, useDocumentContent } from "../workspace/selectors";

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
  return (
    <MarkdownEditor
      {...props}
      value={value}
      onChange={onChange}
      onCursor={setCursor}
    />
  );
}

const setCursor = (line: number, column: number) =>
  useCursor.setState({ line, column });

type PreviewProps = Omit<ComponentProps<typeof MarkdownPreview>, "content">;

export function DocumentPreview(props: PreviewProps) {
  const content = useDeferredValue(
    useDocumentContent(props.documentPath ?? ""),
  );
  return <MarkdownPreview {...props} content={content} />;
}

export function OutlineList({
  documentId,
  onSelect,
}: {
  documentId: string;
  onSelect: (line: number) => void;
}) {
  const content = useDeferredValue(useDocumentContent(documentId));
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

export function CursorStatus() {
  const line = useCursor((state) => state.line);
  const column = useCursor((state) => state.column);
  return <span>{t("줄 {0}, 열 {1}", line, column)}</span>;
}
