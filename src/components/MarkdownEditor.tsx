import {
  useSettings,
  effectiveTheme,
  effectiveLanguage,
} from "../settings/store";
import {
  setMonacoLanguage,
  localizeFindWidget,
} from "../settings/monacoLocale";
import { t } from "../settings/i18n";
import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "../styles/monaco-icons.css";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import type { ScrollTarget, Navigation } from "./MarkdownPreview";
import { scrollEdge, type ScrollEdge } from "../workspace/scroll";
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
interface CachedModel {
  model: monaco.editor.ITextModel;
  view: monaco.editor.ICodeEditorViewState | null;
}
const models = new Map<string, CachedModel>();
export interface EditorCommand {
  id: "find" | "replace" | "undo" | "redo";
  token: number;
}
interface Props {
  documentId: string;
  projectPath?: string;
  value: string;
  onChange: (value: string) => void;
  onCursor: (line: number, column: number) => void;
  readOnly?: boolean;
  onScrollLine?: (line: number, edge?: ScrollEdge) => void;
  syncTarget?: ScrollTarget;
  navigation?: Navigation;
  command?: EditorCommand;
  onCommandHandled?: () => void;
}
export default function MarkdownEditor({
  documentId,
  projectPath = "sample",
  value,
  onChange,
  onCursor,
  readOnly = false,
  onScrollLine,
  syncTarget,
  navigation,
  command,
  onCommandHandled,
}: Props) {
  const preferences = useSettings();
  const theme = effectiveTheme(preferences);
  const language = effectiveLanguage(preferences);
  const fontSize = preferences.settings.editorFontSize;
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suppress = useRef(false);
  const frame = useRef(0);
  const callbacks = useRef({ onChange, onCursor, onScrollLine });
  useEffect(() => {
    setMonacoLanguage(language);
  }, [language]);
  useEffect(() => {
    monaco.editor.defineTheme("oxidoc", {
      base: theme.kind === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: theme.keyword.slice(1) },
        { token: "string", foreground: theme.string.slice(1) },
        { token: "comment", foreground: theme.muted.slice(1) },
      ],
      colors: {
        "editor.background": theme.background,
        "editor.foreground": theme.text,
        "editorLineNumber.foreground": theme.muted,
        "editorLineNumber.activeForeground": theme.text,
        "editorCursor.foreground": theme.accent,
        "editorWidget.background": theme.surface,
        "editorWidget.border": theme.border,
        "input.background": theme.background,
        "input.foreground": theme.text,
        "input.border": theme.border,
        focusBorder: theme.accent,
        "editorIndentGuide.background1": theme.border,
      },
    });
    monaco.editor.setTheme("oxidoc");
    editor.current?.updateOptions({
      fontSize,
      lineHeight: Math.round(fontSize * 1.9),
    });
  }, [theme, fontSize]);
  useEffect(() => {
    callbacks.current = { onChange, onCursor, onScrollLine };
  }, [onChange, onCursor, onScrollLine]);
  useEffect(() => {
    editor.current?.updateOptions({ readOnly });
  }, [readOnly]);
  useEffect(() => {
    if (!container.current) return;
    const key = `${projectPath}\0${documentId}`;
    let cached = models.get(key);
    if (!cached || cached.model.isDisposed()) {
      cached = {
        model: monaco.editor.createModel(value, "markdown"),
        view: null,
      };
      models.set(key, cached);
    } else if (cached.model.getValue() !== value) {
      cached.model.setValue(value);
      cached.view = null;
    }
    cached.model.updateOptions({ tabSize: 2, insertSpaces: true });
    const instance = monaco.editor.create(container.current, {
      model: cached.model,
      readOnly,
      theme: "oxidoc",
      automaticLayout: true,
      fontFamily: "'Cascadia Code', Consolas, 'Malgun Gothic', monospace",
      fontSize,
      lineHeight: Math.round(fontSize * 1.9),
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      find: { addExtraSpaceOnTop: false },
      wordWrap: "on",
      padding: { top: 25, bottom: 32 },
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      renderLineHighlight: "gutter",
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
    });
    editor.current = instance;
    const stopLocalizing = localizeFindWidget(container.current, language);
    if (cached.view) instance.restoreViewState(cached.view);
    const changes = instance.onDidChangeModelContent(() =>
      callbacks.current.onChange(instance.getValue()),
    );
    const cursor = instance.onDidChangeCursorPosition((event) =>
      callbacks.current.onCursor(
        event.position.lineNumber,
        event.position.column,
      ),
    );
    const scrolling = instance.onDidScrollChange(() => {
      if (suppress.current) return;
      const line = instance.getVisibleRanges()[0]?.startLineNumber ?? 1;
      callbacks.current.onScrollLine?.(
        line +
          Math.max(
            0,
            (instance.getScrollTop() - instance.getTopForLineNumber(line)) /
              instance.getOption(monaco.editor.EditorOption.lineHeight),
          ),
        scrollEdge(
          instance.getScrollTop(),
          instance.getScrollHeight(),
          instance.getLayoutInfo().height,
        ),
      );
    });
    return () => {
      cached.view = instance.saveViewState();
      stopLocalizing();
      changes.dispose();
      cursor.dispose();
      scrolling.dispose();
      cancelAnimationFrame(frame.current);
      suppress.current = false;
      instance.dispose();
      editor.current = null;
      while (models.size > 30) {
        const oldest = models.keys().next().value;
        if (!oldest || oldest === key) break;
        models.get(oldest)?.model.dispose();
        models.delete(oldest);
      }
    };
    // Monaco retains per-document models and undo history across tab/view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, projectPath, language]);
  useEffect(() => {
    const model = editor.current?.getModel();
    if (model && model.getValue() !== value) model.setValue(value);
  }, [value]);
  useEffect(() => {
    const instance = editor.current;
    if (!instance || syncTarget?.source !== "preview") return;
    suppress.current = true;
    const line = Math.max(
      1,
      Math.min(instance.getModel()?.getLineCount() ?? 1, syncTarget.line),
    );
    instance.setScrollTop(
      syncTarget.edge === "end"
        ? Math.max(
            0,
            instance.getScrollHeight() - instance.getLayoutInfo().height,
          )
        : syncTarget.edge === "start"
          ? 0
          : instance.getTopForLineNumber(Math.floor(line)) +
            (line % 1) *
              instance.getOption(monaco.editor.EditorOption.lineHeight),
    );
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        suppress.current = false;
      });
    });
  }, [syncTarget]);
  useEffect(() => {
    const instance = editor.current;
    if (!instance || !navigation) return;
    instance.setPosition({
      lineNumber: navigation.line,
      column: navigation.column ?? 1,
    });
    instance.revealLineInCenter(navigation.line);
    instance.focus();
  }, [navigation, documentId]);
  useEffect(() => {
    const instance = editor.current;
    if (!instance || !command) return;
    instance.focus();
    if (command.id === "find") void instance.getAction("actions.find")?.run();
    else if (command.id === "replace")
      void instance.getAction("editor.action.startFindReplaceAction")?.run();
    else instance.trigger("toolbar", command.id, null);
    onCommandHandled?.();
  }, [command, onCommandHandled]);
  return (
    <div
      ref={container}
      style={{ height: "100%", width: "100%" }}
      aria-label={t("Markdown 편집기")}
    />
  );
}
