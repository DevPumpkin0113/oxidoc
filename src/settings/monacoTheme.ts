import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { Theme } from "./themes";

export function applyMonacoTheme(monaco: typeof Monaco, theme: Theme) {
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
      "diffEditor.unchangedRegionBackground": theme.surface,
    },
  });
  monaco.editor.setTheme("oxidoc");
}
