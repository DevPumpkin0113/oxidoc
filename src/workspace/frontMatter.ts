/**
 * YAML front matter: a block at the very start of a document that opens with
 * `---` and closes with `---` or `...`. An unclosed block is ordinary Markdown
 * (a thematic break), matching GitHub and VS Code.
 */
export interface FrontMatter {
  /** Lines between the delimiters. */
  body: string;
  /** 1-based line of the closing delimiter; the body ends on the line before. */
  endLine: number;
  /** Top-level `key: value` pairs; nested lines are joined into the value. */
  entries: { key: string; value: string }[];
}

/** A byte order mark may precede the opening delimiter. */
export const BOM = String.fromCharCode(0xfeff);
const OPEN = /^---[ \t]*$/;
const CLOSE = /^(---|\.\.\.)[ \t]*$/;
const ENTRY = /^([^\s#:][^:]*?):(?:[ \t]+(.*)|[ \t]*)$/;
/** Front matter longer than this is treated as Markdown to keep scans cheap. */
export const FRONT_MATTER_MAX_LINES = 500;

export function parseFrontMatter(content: string): FrontMatter | null {
  const text = content.startsWith(BOM) ? content.slice(1) : content;
  if (!text.startsWith("---")) return null;
  const lines = text.split("\n", FRONT_MATTER_MAX_LINES + 2);
  if (!OPEN.test(lines[0].replace(/\r$/, ""))) return null;
  const close = lines.findIndex(
    (line, index) => index > 0 && CLOSE.test(line.replace(/\r$/, "")),
  );
  if (close < 0) return null;
  const bodyLines = lines
    .slice(1, close)
    .map((line) => line.replace(/\r$/, ""));
  return {
    body: bodyLines.join("\n"),
    endLine: close + 1,
    entries: entries(bodyLines),
  };
}

function entries(lines: string[]) {
  const result: { key: string; value: string }[] = [];
  for (const line of lines) {
    const match = /^\S/.test(line) ? ENTRY.exec(line) : null;
    if (match)
      result.push({ key: match[1].trim(), value: match[2]?.trim() ?? "" });
    else if (
      result.length &&
      line.trim() &&
      !line.trimStart().startsWith("#")
    ) {
      const last = result[result.length - 1];
      last.value = last.value ? `${last.value}\n${line.trim()}` : line.trim();
    }
  }
  return result;
}
