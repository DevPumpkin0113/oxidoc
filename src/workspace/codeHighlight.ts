import DOMPurify from "dompurify";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { Theme } from "../settings/themes";
import { applyMonacoTheme } from "../settings/monacoTheme";
import { lruCache } from "./markdownBlocks";

/** Larger blocks stay plain; colorizing runs on the main thread. */
const MAX_HIGHLIGHT_CHARS = 100_000;
const results = lruCache<string>(300);
const resultKey = (code: string, language: string, theme: Theme) =>
  JSON.stringify([theme.id, language, code]);

type MonacoApi = typeof Monaco;
let loading: Promise<MonacoApi> | null = null;
let appliedTheme = "";

// Monaco is shared with the editor chunk; the language registrations only
// add metadata, and each tokenizer loads the first time its language is used.
function loadMonaco() {
  loading ??= Promise.all([
    import("monaco-editor/editor/editor.api.js"),
    import("monaco-editor/languages/definitions/register.all.js"),
  ]).then(([monaco]) => monaco);
  return loading;
}

/** Monaco language id for a fence info string such as `js` or `TypeScript`. */
export function resolveLanguage(
  languages: { id: string; aliases?: string[]; extensions?: string[] }[],
  name: string,
) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const match = languages.find(
    (language) =>
      language.id.toLowerCase() === wanted ||
      language.aliases?.some((alias) => alias.toLowerCase() === wanted) ||
      language.extensions?.some(
        (extension) => extension.toLowerCase() === `.${wanted}`,
      ),
  );
  return match?.id ?? null;
}

/** Monaco markup reduced to coloured spans and line breaks. */
export const sanitizeHighlight = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["div", "span", "br"],
    ALLOWED_ATTR: ["class"],
  });

/** Highlight already computed for this code, language and theme. */
export const cachedHighlight = (code: string, language: string, theme: Theme) =>
  results.get(resultKey(code, language, theme));

/**
 * Coloured HTML for a code block using the editor's tokenizers and theme
 * colours, or `null` when the language is unknown or the block is too large.
 */
export async function highlightCode(
  code: string,
  language: string,
  theme: Theme,
  monacoApi: () => Promise<MonacoApi> = loadMonaco,
): Promise<string | null> {
  if (!language || code.length > MAX_HIGHLIGHT_CHARS) return null;
  const key = resultKey(code, language, theme);
  const cached = results.get(key);
  if (cached !== undefined) return cached;
  try {
    const monaco = await monacoApi();
    const id = resolveLanguage(monaco.languages.getLanguages(), language);
    if (!id) return null;
    // Token classes resolve to the current Monaco theme's colours.
    if (appliedTheme !== theme.id) {
      applyMonacoTheme(monaco, theme);
      appliedTheme = theme.id;
    }
    const html = sanitizeHighlight(
      await monaco.editor.colorize(code, id, { tabSize: 2 }),
    );
    results.set(key, html);
    return html;
  } catch {
    return null;
  }
}
