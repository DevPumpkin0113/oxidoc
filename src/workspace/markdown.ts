import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
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
export function markdownCodeRegions(content: string) {
  const regions: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  }[] = [];
  function visit(node: MarkdownNode) {
    if (
      (node.type === "code" || node.type === "inlineCode") &&
      node.position?.end
    )
      regions.push({
        startLine: node.position.start.line,
        startColumn: node.position.start.column ?? 1,
        endLine: node.position.end.line,
        endColumn: node.position.end.column,
      });
    else node.children?.forEach(visit);
  }
  visit(parser.parse(content) as MarkdownNode);
  return regions;
}
export function documentLinks(content: string): {
  links: DocumentLink[];
  truncated: boolean;
} {
  const root = parser.parse(content) as MarkdownNode;
  const definitions = new Map<string, string>();
  const links: DocumentLink[] = [];
  let truncated = false;
  function definitionsIn(node: MarkdownNode) {
    if (
      node.type === "definition" &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, node.url);
    node.children?.forEach(definitionsIn);
  }
  definitionsIn(root);
  function visit(node: MarkdownNode) {
    if (
      ["link", "image", "linkReference", "imageReference"].includes(
        node.type,
      ) &&
      node.position
    ) {
      const href = node.url ?? definitions.get(node.identifier ?? "");
      if (href) {
        if (links.length >= 500) {
          truncated = true;
          return;
        }
        links.push({
          href,
          line: node.position.start.line,
          column: node.position.start.column ?? 1,
          endLine: node.position.end?.line ?? node.position.start.line,
          endColumn:
            node.position.end?.column ?? (node.position.start.column ?? 1) + 1,
        });
      }
    }
    node.children?.forEach(visit);
  }
  visit(root);
  return { links, truncated };
}
const plain = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.children?.map(plain).join("") ?? "";
export function headings(content: string): Heading[] {
  const root = parser.parse(content) as MarkdownNode;
  const result: Heading[] = [];
  const used = new Set<string>();
  function visit(node: MarkdownNode) {
    if (node.type === "heading") {
      const title = plain(node);
      const slug =
        title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .trim()
          .replace(/\s+/g, "-") || "section";
      let id = slug;
      let suffix = 0;
      while (used.has(id)) id = `${slug}-${++suffix}`;
      used.add(id);
      result.push({
        title,
        depth: node.depth ?? 1,
        line: node.position?.start.line ?? 1,
        id,
      });
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(root);
  return result;
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
