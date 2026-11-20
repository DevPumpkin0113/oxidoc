import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { BOM, FRONT_MATTER_MAX_LINES, parseFrontMatter } from "./frontMatter";

const KEY = /^[^\s#:][^:]*?(?=:([ \t]|$))/;

/** Decorations for a document's front matter: muted delimiters and keys. */
export function frontMatterDecorations(
  lines: string[],
): Monaco.editor.IModelDeltaDecoration[] {
  const frontMatter = parseFrontMatter(lines.join("\n"));
  if (!frontMatter) return [];
  const line = (lineNumber: number, className: string, end?: number) => ({
    range: {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: (end ?? lines[lineNumber - 1].length) + 1,
    },
    options: { inlineClassName: className },
  });
  const result = [
    line(1, "oxidoc-front-matter-delimiter"),
    line(frontMatter.endLine, "oxidoc-front-matter-delimiter"),
  ];
  for (let lineNumber = 2; lineNumber < frontMatter.endLine; lineNumber++) {
    const text = lines[lineNumber - 1];
    if (!text) continue;
    // The body is YAML, so Markdown colours (headings, lists) are reset first.
    result.push(line(lineNumber, "oxidoc-front-matter"));
    const key = KEY.exec(text);
    if (key)
      result.push(line(lineNumber, "oxidoc-front-matter-key", key[0].length));
  }
  return result;
}

/** Keeps the front matter decorations of an editor's model up to date. */
export function attachFrontMatter(
  instance: Monaco.editor.IStandaloneCodeEditor,
) {
  const decorations = instance.createDecorationsCollection();
  const update = () => {
    const model = instance.getModel();
    if (!model) return;
    const count = Math.min(model.getLineCount(), FRONT_MATTER_MAX_LINES + 2);
    const lines: string[] = [];
    for (let index = 1; index <= count; index++)
      lines.push(model.getLineContent(index));
    decorations.set(frontMatterDecorations(lines));
  };
  update();
  const changes = instance.onDidChangeModelContent((event) => {
    const model = instance.getModel();
    if (!model) return;
    // Without a `---` first line there is no front matter to open or close,
    // so typing elsewhere in an ordinary document skips the rescan.
    if (
      model.getLineContent(1).replace(BOM, "").startsWith("---") ||
      event.changes.some((change) => change.range.startLineNumber === 1)
    )
      update();
  });
  return () => {
    changes.dispose();
    decorations.clear();
  };
}
