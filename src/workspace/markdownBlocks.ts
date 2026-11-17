/**
 * Splits Markdown into top-level blocks that parse to the same result
 * independently, so parsing and rendering cost follows the edited block rather
 * than the whole document (the parser is superlinear on large documents).
 */
export interface MarkdownBlock {
  /** Block source without surrounding blank lines. */
  text: string;
  /** 1-based line of the block's first line in the document. */
  line: number;
  /** Stable React key: the text plus its occurrence index. */
  key: string;
}

export interface SplitResult {
  blocks: MarkdownBlock[];
  /**
   * Link reference definitions of the whole document, appended to each block
   * when parsed so reference links resolve across blocks.
   */
  definitions: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^([-+*]|\d{1,9}[.)])([ \t]|$)/;
const DEFINITION = /^ {0,3}\[[^\]^][^\]]*\]:[ \t]*\S/;
const BLANK = /^[ \t]*$/;
// HTML containers whose content may span blank lines (`<details>` wrapping
// Markdown); their open and close tags must be parsed in the same block.
const HTML_CONTAINER =
  /<(\/?)(details|div|dl|table|blockquote)(?=[\s/>])[^>]*>/gi;
const INLINE_CODE = /(`+)[^`]*?\1/g;

/** Change in open HTML container depth caused by one line. */
function htmlDepthChange(line: string) {
  if (!line.includes("<")) return 0;
  let change = 0;
  for (const match of line.replace(INLINE_CODE, "").matchAll(HTML_CONTAINER))
    if (match[1]) change--;
    else if (!match[0].endsWith("/>")) change++;
  return change;
}

/** Whether a blank line before `next` may end a block without changing meaning. */
const canStartBlock = (next: string) =>
  !BLANK.test(next) && !/^[ \t]/.test(next) && !LIST_ITEM.test(next);

export function splitBlocks(content: string): SplitResult {
  // Footnotes render a document-level section; keep such documents whole.
  if (content.includes("[^"))
    return {
      blocks: content ? [{ text: content, line: 1, key: content }] : [],
      definitions: "",
    };
  const lines = content.split("\n");
  // Next non-blank line after each index, computed once to keep the scan linear.
  const nextText: (string | undefined)[] = new Array(lines.length);
  for (
    let index = lines.length - 1, next: string | undefined;
    index >= 0;
    index--
  ) {
    nextText[index] = next;
    if (!BLANK.test(lines[index])) next = lines[index];
  }
  const blocks: MarkdownBlock[] = [];
  const definitions: string[] = [];
  const seen = new Map<string, number>();
  let fence: { char: string; length: number } | null = null;
  let comment = false;
  let htmlDepth = 0;
  let start = -1;
  const push = (end: number) => {
    if (start < 0) return;
    const text = lines.slice(start, end).join("\n");
    const count = seen.get(text) ?? 0;
    seen.set(text, count + 1);
    blocks.push({ text, line: start + 1, key: `${count}:${text}` });
    start = -1;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      const close = FENCE.exec(line);
      if (
        close &&
        close[1][0] === fence.char &&
        close[1].length >= fence.length &&
        BLANK.test(line.slice(close[0].length))
      )
        fence = null;
      continue;
    }
    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }
    if (BLANK.test(line)) {
      const next = nextText[index];
      if (next === undefined || (htmlDepth === 0 && canStartBlock(next)))
        push(index);
      continue;
    }
    if (start < 0) start = index;
    const open = FENCE.exec(line);
    if (open) fence = { char: open[1][0], length: open[1].length };
    else if (/^ {0,3}<!--/.test(line) && !line.includes("-->")) comment = true;
    else if (DEFINITION.test(line)) definitions.push(line);
    else htmlDepth = Math.max(0, htmlDepth + htmlDepthChange(line));
  }
  push(lines.length);
  return { blocks, definitions: definitions.join("\n") };
}

/** Text to parse for a block: the block plus document-wide definitions. */
export const blockSource = (block: MarkdownBlock, definitions: string) =>
  definitions ? `${block.text}\n\n${definitions}` : block.text;

/** Small least-recently-used cache for per-block parse results. */
export function lruCache<V>(limit: number) {
  const entries = new Map<string, V>();
  return {
    get(key: string) {
      const value = entries.get(key);
      if (value !== undefined) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set(key: string, value: V) {
      entries.set(key, value);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
  };
}
