/**
 * Rewrites relative Markdown links after a file or folder moves, so links in
 * other documents and the moved documents' own relative links keep working.
 * Only inline links, images and reference definitions are rewritten; code,
 * raw HTML, anchors and external URLs are left alone.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { splitBlocks } from "./markdownBlocks";
import { resolveLink } from "./markdown";
import { isDocumentUnder, sameDocumentPath } from "./model";

/** A file or folder moving from one project-relative path to another. */
export interface PathMove {
  from: string;
  to: string;
}

/** A Markdown file whose links change; `path` is where it lives after the move. */
export interface LinkUpdate {
  path: string;
  oldPath: string;
  before: string;
  after: string;
  count: number;
}

interface Node {
  type: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
interface Destination {
  start: number;
  end: number;
  raw: string;
  angle: boolean;
}

const parser = unified().use(remarkParse).use(remarkGfm);
const isMarkdown = (path: string) => /\.md$/i.test(path);

/** Where a path ends up after the move (unchanged when outside it). */
export function movedPath(path: string, move: PathMove) {
  return isDocumentUnder(path, move.from)
    ? move.to + path.slice(move.from.length)
    : path;
}

/** Link destination starting at `position` (after `](` or `]:`). */
function destinationAt(text: string, position: number): Destination | null {
  let index = position;
  while (text[index] === " " || text[index] === "\t") index++;
  if (text[index] === "\r") index++;
  if (text[index] === "\n") index++;
  while (text[index] === " " || text[index] === "\t") index++;
  if (text[index] === "<") {
    const close = text.indexOf(">", index + 1);
    if (close < 0 || /[\r\n]/.test(text.slice(index + 1, close))) return null;
    return {
      start: index + 1,
      end: close,
      raw: text.slice(index + 1, close),
      angle: true,
    };
  }
  let end = index;
  let depth = 0;
  while (end < text.length) {
    const char = text[end];
    if (char === "\\" && end + 1 < text.length) {
      end += 2;
      continue;
    }
    if (/\s/.test(char)) break;
    if (char === "(") depth++;
    else if (char === ")") {
      if (!depth) break;
      depth--;
    }
    end++;
  }
  return end > index
    ? { start: index, end, raw: text.slice(index, end), angle: false }
    : null;
}

/** Destinations of inline links, images and definitions, outside code. */
export function linkDestinations(content: string): Destination[] {
  const lineStarts = [0];
  for (let index = 0; index < content.length; index++)
    if (content[index] === "\n") lineStarts.push(index + 1);
  const found: Destination[] = [];
  for (const block of splitBlocks(content).blocks) {
    const base = lineStarts[block.line - 1];
    const text = block.text;
    (function visit(node: Node) {
      if (["code", "inlineCode", "html"].includes(node.type)) return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        const span = text.slice(start, end);
        let opener = -1;
        if (
          (node.type === "link" || node.type === "image") &&
          span.endsWith(")")
        )
          opener = span.lastIndexOf("](");
        else if (node.type === "definition") opener = span.indexOf("]:");
        const destination =
          opener < 0 ? null : destinationAt(text, start + opener + 2);
        if (destination && destination.end <= end)
          found.push({
            ...destination,
            start: base + destination.start,
            end: base + destination.end,
          });
      }
      node.children?.forEach(visit);
    })(parser.parse(text) as Node);
  }
  return found;
}

const unescape = (raw: string) => raw.replace(/\\([!-/:-@[-`{-~])/g, "$1");
const percent = (char: string) =>
  [...new TextEncoder().encode(char)]
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");

/** Relative path segments from a document to a target, both project-relative. */
function relativeSegments(document: string, target: string) {
  const parent = document.split("/").slice(0, -1);
  const parts = target.split("/").filter(Boolean);
  while (
    parent.length &&
    parts.length &&
    parent[0].toLowerCase() === parts[0].toLowerCase()
  ) {
    parent.shift();
    parts.shift();
  }
  return [...parent.map(() => ".."), ...parts];
}

/**
 * New link text pointing from `document` to `target`, keeping the original's
 * style: percent-encoding, `./` prefix, angle brackets, trailing slash and
 * the `#anchor` part as written.
 */
function rewrittenHref(
  destination: Destination,
  document: string,
  target: string,
) {
  const raw = destination.raw;
  const hashIndex = raw.indexOf("#");
  const path = hashIndex < 0 ? raw : raw.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : raw.slice(hashIndex);
  const encoded = path.includes("%");
  const encode = (segment: string) =>
    segment === ".."
      ? segment
      : encoded
        ? encodeURIComponent(segment).replace(/[!'()*]/g, percent)
        : destination.angle
          ? segment.replace(/[<>]/g, percent)
          : segment.replace(/[\s()<>#?%\\]/g, percent);
  const segments = relativeSegments(document, target).map(encode);
  let result = segments.join("/") || ".";
  if (path.startsWith("./") && !result.startsWith(".")) result = `./${result}`;
  if (path.endsWith("/") && !result.endsWith("/")) result += "/";
  return result + hash;
}

/**
 * Text of a Markdown file at `path` with its links fixed for the move, and
 * how many links changed.
 */
export function updatedLinks(path: string, content: string, move: PathMove) {
  const document = movedPath(path, move);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const destination of linkDestinations(content)) {
    const href = unescape(destination.raw);
    const before = resolveLink(path, href);
    if (before.kind !== "local") continue;
    const target = movedPath(before.path, move);
    const after = resolveLink(document, href);
    if (after.kind === "local" && sameDocumentPath(after.path, target))
      continue;
    edits.push({
      start: destination.start,
      end: destination.end,
      text: rewrittenHref(destination, document, target),
    });
  }
  let after = content;
  for (const edit of [...edits].reverse())
    after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
  return { after, count: edits.length };
}

/** Markdown files whose links change when `move` happens. */
export function planLinkUpdates(
  files: { path: string; text: string }[],
  move: PathMove,
): LinkUpdate[] {
  return files.flatMap((file) => {
    if (!isMarkdown(file.path)) return [];
    const { after, count } = updatedLinks(file.path, file.text, move);
    return count
      ? [
          {
            path: movedPath(file.path, move),
            oldPath: file.path,
            before: file.text,
            after,
            count,
          },
        ]
      : [];
  });
}
