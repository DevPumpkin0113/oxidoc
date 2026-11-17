import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import {
  blockSource,
  lruCache,
  splitBlocks,
  type SplitResult,
} from "./markdownBlocks";
interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  alt?: string;
  children?: MarkdownNode[];
  url?: string;
  identifier?: string;
  position?: {
    start: { line: number; column?: number };
    end?: { line: number; column: number };
  };
}
export interface Heading {
  title: string;
  depth: number;
  line: number;
  id: string;
}
const parser = unified().use(remarkParse).use(remarkGfm);
export interface DocumentLink {
  href: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}
export interface CodeRegion {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
const MAX_DOCUMENT_LINKS = 500;
const plain = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.children?.map(plain).join("") ?? "";

/** Parse results of one block, with lines relative to the block. */
interface BlockAnalysis {
  headings: Omit<Heading, "id">[];
  code: CodeRegion[];
  links: DocumentLink[];
}
const analyses = lruCache<BlockAnalysis>(20_000);

function analyze(source: string): BlockAnalysis {
  const cached = analyses.get(source);
  if (cached) return cached;
  const root = parser.parse(source) as MarkdownNode;
  const definitions = new Map<string, string>();
  (function definitionsIn(node: MarkdownNode) {
    if (
      node.type === "definition" &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, node.url);
    node.children?.forEach(definitionsIn);
  })(root);
  const result: BlockAnalysis = { headings: [], code: [], links: [] };
  (function visit(node: MarkdownNode) {
    if (node.type === "heading")
      result.headings.push({
        title: plain(node),
        depth: node.depth ?? 1,
        line: node.position?.start.line ?? 1,
      });
    if (
      (node.type === "code" || node.type === "inlineCode") &&
      node.position?.end
    ) {
      result.code.push({
        startLine: node.position.start.line,
        startColumn: node.position.start.column ?? 1,
        endLine: node.position.end.line,
        endColumn: node.position.end.column,
      });
      return;
    }
    if (
      ["link", "image", "linkReference", "imageReference"].includes(
        node.type,
      ) &&
      node.position
    ) {
      const href = node.url ?? definitions.get(node.identifier ?? "");
      if (href)
        result.links.push({
          href,
          line: node.position.start.line,
          column: node.position.start.column ?? 1,
          endLine: node.position.end?.line ?? node.position.start.line,
          endColumn:
            node.position.end?.column ?? (node.position.start.column ?? 1) + 1,
        });
    }
    node.children?.forEach(visit);
  })(root);
  analyses.set(source, result);
  return result;
}

/** Each block's cached analysis and the line offset that makes it absolute. */
function analyzedBlocks(
  { blocks, definitions }: SplitResult,
  limit = blocks.length,
) {
  return blocks.slice(0, limit).map((block) => ({
    offset: block.line - 1,
    analysis: analyze(blockSource(block, definitions)),
  }));
}

export function markdownCodeRegions(content: string): CodeRegion[] {
  return analyzedBlocks(splitBlocks(content)).flatMap(({ offset, analysis }) =>
    analysis.code.map((region) => ({
      ...region,
      startLine: region.startLine + offset,
      endLine: region.endLine + offset,
    })),
  );
}

export function documentLinks(content: string): {
  links: DocumentLink[];
  truncated: boolean;
} {
  const links: DocumentLink[] = [];
  for (const { offset, analysis } of analyzedBlocks(splitBlocks(content)))
    for (const link of analysis.links) {
      if (links.length >= MAX_DOCUMENT_LINKS) return { links, truncated: true };
      links.push({
        ...link,
        line: link.line + offset,
        endLine: link.endLine + offset,
      });
    }
  return { links, truncated: false };
}

export const headings = (content: string): Heading[] =>
  blockHeadings(splitBlocks(content));

/**
 * Headings of the first `limit` blocks. Ids only depend on earlier headings,
 * so a prefix gets the same ids as the whole document.
 */
export function blockHeadings(split: SplitResult, limit?: number): Heading[] {
  const used = new Set<string>();
  return analyzedBlocks(split, limit).flatMap(({ offset, analysis }) =>
    analysis.headings.map((heading) => {
      const slug =
        heading.title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .trim()
          .replace(/\s+/g, "-") || "section";
      let id = slug;
      let suffix = 0;
      while (used.has(id)) id = `${slug}-${++suffix}`;
      used.add(id);
      return { ...heading, line: heading.line + offset, id };
    }),
  );
}
export type LinkTarget =
  | { kind: "local"; path: string; hash: string }
  | { kind: "anchor"; hash: string }
  | { kind: "external"; url: string }
  | { kind: "blocked" };
export function resolveLink(documentPath: string, href: string): LinkTarget {
  if (href.startsWith("#")) {
    try {
      return { kind: "anchor", hash: decodeURIComponent(href.slice(1)) };
    } catch {
      return { kind: "blocked" };
    }
  }
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      return { kind: "external", url: url.href };
    } catch {
      return { kind: "blocked" };
    }
  }
  if (
    !href ||
    /^[a-z][a-z\d+.-]*:/i.test(href) ||
    href.startsWith("/") ||
    href.startsWith("\\") ||
    href.includes("\\")
  )
    return { kind: "blocked" };
  const [raw, hash = ""] = href.split("#", 2);
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { kind: "blocked" };
  }
  if (
    decoded.includes("\\") ||
    decoded.startsWith("/") ||
    decoded.includes("\0") ||
    /^[a-z][a-z\d+.-]*:/i.test(decoded)
  )
    return { kind: "blocked" };
  const parts = documentPath.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return { kind: "blocked" };
      parts.pop();
    } else parts.push(part);
  }
  try {
    return {
      kind: "local",
      path: parts.join("/"),
      hash: decodeURIComponent(hash),
    };
  } catch {
    return { kind: "blocked" };
  }
}
interface HtmlNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  position?: { start: { line: number } };
  children?: HtmlNode[];
}
export function sourceLines() {
  return (tree: HtmlNode) => {
    function visit(node: HtmlNode) {
      if (
        node.type === "element" &&
        node.position &&
        [
          "p",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "ul",
          "ol",
          "pre",
          "table",
          "blockquote",
          "hr",
        ].includes(node.tagName ?? "")
      ) {
        node.properties ??= {};
        node.properties["data-source-line"] = node.position.start.line;
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
  };
}
