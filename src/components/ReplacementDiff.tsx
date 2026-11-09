import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "../workspace/monacoEnvironment";
import "../styles/monaco-icons.css";
import { useSettings, effectiveTheme } from "../settings/store";
import { applyMonacoTheme } from "../settings/monacoTheme";
import { t } from "../settings/i18n";
import styles from "./ProjectReplace.module.css";

export default function ReplacementDiff({
  before,
  after,
  sideBySide,
}: {
  before: string;
  after: string;
  sideBySide: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const preferences = useSettings();
  const theme = effectiveTheme(preferences);
  const fontSize = preferences.settings.editorFontSize;
  const appearance = useRef({ fontSize, sideBySide });
  useEffect(() => {
    appearance.current.fontSize = fontSize;
    applyMonacoTheme(monaco, theme);
    editor.current?.updateOptions({
      fontSize,
      lineHeight: Math.round(fontSize * 1.7),
    });
  }, [theme, fontSize]);
  useEffect(() => {
    let original: monaco.editor.ITextModel | undefined;
    let modified: monaco.editor.ITextModel | undefined;
    let instance: monaco.editor.IStandaloneDiffEditor | undefined;
    // Avoid starting worker computation for Strict Mode's discarded mount.
    const frame = requestAnimationFrame(() => {
      if (!container.current) return;
      const { fontSize, sideBySide } = appearance.current;
      original = monaco.editor.createModel(before, "markdown");
      modified = monaco.editor.createModel(after, "markdown");
      instance = monaco.editor.createDiffEditor(container.current, {
        theme: "oxidoc",
        automaticLayout: true,
        readOnly: true,
        domReadOnly: true,
        originalEditable: false,
        contextmenu: false,
        fontFamily: "'Cascadia Code', Consolas, 'Malgun Gothic', monospace",
        fontSize,
        lineHeight: Math.round(fontSize * 1.7),
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderSideBySide: sideBySide,
        renderSideBySideInlineBreakpoint: 560,
        useInlineViewWhenSpaceIsLimited: true,
        renderOverviewRuler: false,
        ignoreTrimWhitespace: false,
        diffAlgorithm: "advanced",
        maxComputationTime: 1000,
        hideUnchangedRegions: {
          enabled: true,
          contextLineCount: 3,
          minimumLineCount: 5,
          revealLineCount: 10,
        },
        diffWordWrap: "on",
        padding: { top: 10, bottom: 10 },
        ariaLabel: t("변경 차이 미리보기"),
      });
      instance.setModel({ original, modified });
      editor.current = instance;
    });
    return () => {
      cancelAnimationFrame(frame);
      instance?.setModel(null);
      instance?.dispose();
      original?.dispose();
      modified?.dispose();
      editor.current = null;
    };
    // Recreate only when the preview changes; appearance updates retain scroll position.
  }, [before, after]);
  useEffect(() => {
    appearance.current.sideBySide = sideBySide;
    editor.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [sideBySide]);
  return (
    <div
      className={styles.diffEditor}
      ref={container}
      aria-label={t("변경 차이 미리보기")}
      role="group"
      tabIndex={0}
      data-replace-control
      onFocus={(event) => {
        if (event.target === event.currentTarget)
          editor.current?.getModifiedEditor().focus();
      }}
    />
  );
}
