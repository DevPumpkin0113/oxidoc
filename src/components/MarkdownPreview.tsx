import { translateError, t } from "../settings/i18n";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createElement,
  startTransition,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { workspaceApi } from "../workspace/api";
import {
  blockHeadings as headingsOfBlocks,
  headings,
  resolveLink,
  sourceLines,
  type LinkTarget,
} from "../workspace/markdown";
import styles from "./MarkdownPreview.module.css";
import MermaidDiagram from "./MermaidDiagram";
import { effectiveTheme, useSettings } from "../settings/store";
import { cachedHighlight, highlightCode } from "../workspace/codeHighlight";
import ScrollArea from "./ScrollArea";
import { isMermaidFile } from "../workspace/documentTypes";
import {
  blockSource,
  splitBlocks,
  type MarkdownBlock,
} from "../workspace/markdownBlocks";
import { scrollEdge, type ScrollEdge } from "../workspace/scroll";
export interface ScrollTarget {
  source: "editor" | "preview";
  line: number;
  token: number;
  edge?: ScrollEdge;
}
export interface Navigation {
  line: number;
  column?: number;
  token: number;
}
interface PreviewContextValue {
  root?: string;
  documentPath: string;
  desktop: boolean;
  follow: (href: string) => void;
}
const PreviewContext = createContext<PreviewContextValue | null>(null);
/** Heading ids of one block, keyed by line relative to the block. */
const BlockHeadings = createContext<Map<number, string>>(new Map());
function LocalImage({ src, alt }: { src?: string; alt?: string }) {
  const context = useContext(PreviewContext)!;
  const target = resolveLink(context.documentPath, src ?? "");
  const path = target.kind === "local" ? target.path : null;
  const root = context.root,
    desktop = context.desktop;
  const key = `${root}:${context.documentPath}:${src}`;
  const [result, setResult] = useState<{
    key: string;
    image: string;
    error: string;
  }>();
  useEffect(() => {
    if (!path || !root || !desktop) return;
    let active = true;
    void workspaceApi
      .advanced!.image(root, path)
      .then((image) => {
        if (active) setResult({ key, image, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ key, image: "", error: String(error) });
      });
    return () => {
      active = false;
    };
  }, [path, root, desktop, key]);
  const image = result?.key === key ? result.image : "";
  const error =
    !path || !root || !desktop
      ? t("외부 이미지 또는 지원하지 않는 경로")
      : result?.key === key
        ? result.error
        : "";
  return image ? (
    <img
      src={image}
      alt={alt ?? ""}
      onError={() =>
        setResult({ key, image: "", error: t("이미지를 표시할 수 없습니다.") })
      }
    />
  ) : (
    <span className={styles.imagePlaceholder} title={translateError(error)}>
      {alt || t("이미지")}
      {error ? ` · ${translateError(error)}` : t(" · 불러오는 중…")}
    </span>
  );
}
function PreviewHeading({
  node,
  children,
}: {
  node?: { tagName?: string; position?: { start: { line: number } } };
  children?: React.ReactNode;
}) {
  const ids = useContext(BlockHeadings);
  const line = node?.position?.start.line;
  return createElement(
    node?.tagName ?? "h2",
    {
      id: line === undefined ? undefined : ids.get(line),
      "data-source-line": line,
    },
    children,
  );
}
function PreviewLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const context = useContext(PreviewContext)!;
  return (
    <a
      href={href}
      className={styles.sampleLink}
      title={
        /^https?:/i.test(href ?? "") ? t("기본 브라우저에서 열기") : undefined
      }
      onClick={(event) => {
        event.preventDefault();
        context.follow(href ?? "");
      }}
    >
      {children}
    </a>
  );
}
function PreviewImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  return (
    <LocalImage src={typeof src === "string" ? src : undefined} alt={alt} />
  );
}
function PreviewCodeBlock({
  node,
  children,
}: {
  node?: {
    position?: { start: { line: number } };
    children?: Array<{
      type: string;
      tagName?: string;
      properties?: { className?: unknown };
      children?: Array<{ type: string; value?: string }>;
    }>;
  };
  children?: React.ReactNode;
}) {
  const code = node?.children?.[0];
  const classes = code?.properties?.className;
  const language =
    code?.tagName === "code" && Array.isArray(classes)
      ? (classes
          .find(
            (name): name is string =>
              typeof name === "string" && name.startsWith("language-"),
          )
          ?.slice("language-".length) ?? "")
      : "";
  const source =
    code?.children
      ?.map((child) => child.value ?? "")
      .join("")
      .replace(/\n$/, "") ?? "";
  if (language === "mermaid")
    return <MermaidDiagram line={node?.position?.start.line} source={source} />;
  return (
    <ScrollArea
      as="pre"
      axis="x"
      boxProps={{ "data-source-line": node?.position?.start.line }}
    >
      {language ? (
        <HighlightedCode language={language} source={source}>
          {children}
        </HighlightedCode>
      ) : (
        children
      )}
    </ScrollArea>
  );
}

/** Code shown plain first, then with the editor's colours once highlighted. */
function HighlightedCode({
  language,
  source,
  children,
}: {
  language: string;
  source: string;
  children?: React.ReactNode;
}) {
  const theme = useSettings(effectiveTheme);
  const cached = cachedHighlight(source, language, theme);
  const key = JSON.stringify([theme.id, language, source]);
  const [result, setResult] = useState<{ key: string; html: string | null }>();
  useEffect(() => {
    if (cached !== undefined) return;
    let active = true;
    void highlightCode(source, language, theme).then((html) => {
      if (active) setResult({ key, html });
    });
    return () => {
      active = false;
    };
  }, [cached, key, language, source, theme]);
  const html = cached ?? (result?.key === key ? result.html : null);
  if (!html) return children;
  return (
    <code
      className={`language-${language} ${styles.highlighted}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
const previewComponents = {
  pre: PreviewCodeBlock,
  h1: PreviewHeading,
  h2: PreviewHeading,
  h3: PreviewHeading,
  h4: PreviewHeading,
  h5: PreviewHeading,
  h6: PreviewHeading,
  a: PreviewLink,
  img: PreviewImage,
};
/** Blocks rendered at once when a document opens; the rest follow in batches. */
const INITIAL_BLOCKS = 40;
const BLOCK_BATCH = 40;

const remarkPlugins = [remarkGfm];
const rehypePlugins = [sourceLines];

/** One Markdown block; skipped on re-render unless its source or heading ids change. */
const PreviewBlock = memo(function PreviewBlock({
  source,
  headingIds,
}: {
  source: string;
  headingIds: string;
}) {
  const ids = useMemo(
    () =>
      new Map(
        headingIds
          ? headingIds.split("\n").map((item) => {
              const separator = item.indexOf(":");
              return [
                Number(item.slice(0, separator)),
                item.slice(separator + 1),
              ] as const;
            })
          : [],
      ),
    [headingIds],
  );
  return (
    <BlockHeadings value={ids}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        skipHtml
        components={previewComponents}
      >
        {source}
      </ReactMarkdown>
    </BlockHeadings>
  );
});

/** `line:id` lines of the headings inside each block, keyed by block key. */
function headingIdsByBlock(
  blocks: MarkdownBlock[],
  allHeadings: ReturnType<typeof headings>,
) {
  const result = new Map<string, string>();
  let index = 0;
  blocks.forEach((block, position) => {
    const end = blocks[position + 1]?.line ?? Infinity;
    const ids: string[] = [];
    while (index < allHeadings.length && allHeadings[index].line < end) {
      const heading = allHeadings[index++];
      if (heading.line >= block.line)
        ids.push(`${heading.line - block.line + 1}:${heading.id}`);
    }
    if (ids.length) result.set(block.key, ids.join("\n"));
  });
  return result;
}

interface LineNode {
  node: HTMLElement;
  line: number;
}

/** Rendered nodes that carry a source line, with absolute document lines. */
function lineNodes(container: HTMLElement) {
  const result: LineNode[] = [];
  for (const child of container.children as HTMLCollectionOf<HTMLElement>) {
    const offset = child.dataset.lineOffset;
    if (offset === undefined) {
      if (child.dataset.sourceLine)
        result.push({ node: child, line: Number(child.dataset.sourceLine) });
      continue;
    }
    for (const node of child.children as HTMLCollectionOf<HTMLElement>)
      if (node.dataset.sourceLine)
        result.push({
          node,
          line: Number(offset) + Number(node.dataset.sourceLine),
        });
  }
  return result;
}

export default function MarkdownPreview({
  content,
  documentPath = "",
  root,
  desktop = false,
  onNavigate,
  onScrollLine,
  syncTarget,
  navigation,
}: {
  content: string;
  documentPath?: string;
  root?: string;
  desktop?: boolean;
  onNavigate?: (target: LinkTarget) => void;
  onScrollLine?: (line: number, edge?: ScrollEdge) => void;
  syncTarget?: ScrollTarget;
  navigation?: Navigation;
}) {
  const article = useRef<HTMLElement>(null);
  const suppress = useRef(false);
  const frame = useRef(0);
  const standalone = isMermaidFile(documentPath);
  const split = useMemo(
    () => (standalone ? { blocks: [], definitions: "" } : splitBlocks(content)),
    [content, standalone],
  );
  const { blocks, definitions } = split;
  const totalLines = content.split("\n").length;
  // Large documents render progressively so the top shows at once and typing
  // stays responsive; each batch yields to input between blocks.
  const [rendered, setRendered] = useState({
    path: documentPath,
    count: INITIAL_BLOCKS,
  });
  const count =
    rendered.path === documentPath ? rendered.count : INITIAL_BLOCKS;
  const complete = count >= blocks.length;
  // Only rendered blocks need heading ids, and ids depend on earlier headings only.
  const blockHeadings = useMemo(
    () => headingIdsByBlock(blocks, headingsOfBlocks(split, count)),
    [blocks, split, count],
  );
  /** First line not rendered yet; scroll math treats it as the document end. */
  const renderedEnd = complete ? totalLines + 1 : blocks[count].line;
  useEffect(() => {
    if (complete) return;
    const timer = setTimeout(() =>
      startTransition(() =>
        setRendered({ path: documentPath, count: count + BLOCK_BATCH }),
      ),
    );
    return () => clearTimeout(timer);
  }, [complete, count, documentPath]);
  /** Scroll request waiting for its target block to render. */
  const pending = useRef<{ line: number; edge?: ScrollEdge } | null>(null);
  function scrollTo(line: number, edge?: ScrollEdge) {
    const container = article.current;
    if (!container) return;
    if (!complete && (edge === "end" || line >= renderedEnd)) {
      pending.current = { line, edge };
      const target =
        edge === "end"
          ? blocks.length
          : blocks.findIndex((block) => block.line > line) + BLOCK_BATCH;
      setRendered({
        path: documentPath,
        count: target < BLOCK_BATCH ? blocks.length : target,
      });
      return;
    }
    if (edge) {
      setScroll(
        edge === "end"
          ? Math.max(0, container.scrollHeight - container.clientHeight)
          : 0,
      );
      return;
    }
    const nodes = lineNodes(container);
    let before: LineNode | undefined = nodes[0],
      after: LineNode | undefined;
    for (const item of nodes) {
      if (item.line <= line) before = item;
      else {
        after = item;
        break;
      }
    }
    if (!before) return;
    const top =
      before.node.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    const end = after
      ? after.node.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop
      : container.scrollHeight;
    const startLine = before.line || 1;
    const endLine = after ? after.line : renderedEnd;
    setScroll(
      top +
        (end - top) *
          Math.max(
            0,
            Math.min(1, (line - startLine) / Math.max(1, endLine - startLine)),
          ),
    );
  }
  function setScroll(top: number) {
    if (!article.current) return;
    suppress.current = true;
    article.current.scrollTop = top;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        suppress.current = false;
      });
    });
  }
  const scrollRef = useRef(scrollTo);
  const notifyNavigation = useEffectEvent((line: number) =>
    onScrollLine?.(line),
  );
  useEffect(() => {
    scrollRef.current = scrollTo;
  });
  useEffect(() => {
    if (syncTarget?.source !== "editor") return;
    scrollRef.current(syncTarget.line, syncTarget.edge);
    // A deferred preview, image or font can change rendered height after the
    // editor has reached its end. Keep that edge pinned until the user scrolls.
    if (
      syncTarget.edge !== "end" ||
      !article.current ||
      typeof ResizeObserver === "undefined"
    )
      return;
    const observer = new ResizeObserver(() =>
      scrollRef.current(syncTarget.line, "end"),
    );
    observer.observe(article.current);
    for (const { node } of lineNodes(article.current)) observer.observe(node);
    return () => observer.disconnect();
  }, [syncTarget, content]);
  useEffect(() => {
    if (navigation) {
      scrollRef.current(navigation.line);
      notifyNavigation(navigation.line);
    }
  }, [navigation, documentPath]);
  useEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (!complete && (request.edge || request.line >= renderedEnd)) return;
    pending.current = null;
    scrollRef.current(request.line, request.edge);
  }, [complete, renderedEnd]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function onScroll() {
    if (suppress.current || !onScrollLine) return;
    const container = article.current;
    if (!container) return;
    const edge = scrollEdge(
      container.scrollTop,
      container.scrollHeight,
      container.clientHeight,
    );
    if (edge === "start" || (edge === "end" && complete)) {
      onScrollLine(edge === "end" ? totalLines : 1, edge);
      return;
    }
    const nodes = lineNodes(container);
    let before: LineNode | undefined = nodes[0],
      after: LineNode | undefined;
    for (const item of nodes) {
      if (
        item.node.getBoundingClientRect().top -
          container.getBoundingClientRect().top <=
        2
      )
        before = item;
      else {
        after = item;
        break;
      }
    }
    if (!before) {
      onScrollLine(1);
      return;
    }
    const start = before.line || 1;
    const end = after ? after.line : renderedEnd;
    const top =
      before.node.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    const bottom = after
      ? after.node.getBoundingClientRect().top -
        container.getBoundingClientRect().top
      : container.scrollHeight - container.scrollTop;
    onScrollLine(
      start +
        (end - start) *
          Math.max(0, Math.min(1, -top / Math.max(1, bottom - top))),
    );
  }
  function followLink(href: string) {
    const target = resolveLink(documentPath, href);
    if (target.kind === "anchor") {
      const heading = headings(content).find(
        (heading) => heading.id === target.hash,
      );
      if (heading) {
        scrollTo(heading.line);
        onScrollLine?.(heading.line);
      }
    } else onNavigate?.(target);
  }
  // Blocks are memoized, so the context value and callback must stay stable.
  const followRef = useRef(followLink);
  useLayoutEffect(() => {
    followRef.current = followLink;
  });
  const follow = useCallback((href: string) => followRef.current(href), []);
  const context = useMemo(
    () => ({ root, documentPath, desktop, follow }),
    [root, documentPath, desktop, follow],
  );
  return (
    <PreviewContext value={context}>
      <ScrollArea
        as="article"
        className={styles.previewArea}
        viewportClassName={styles.preview}
        viewportRef={article}
        aria-label={t(standalone ? "Mermaid 미리보기" : "Markdown 미리보기")}
        onScroll={onScroll}
      >
        {standalone ? (
          <MermaidDiagram source={content} line={1} />
        ) : (
          blocks.slice(0, count).map((block) => (
            <div
              key={block.key}
              className={styles.block}
              data-line-offset={block.line - 1}
            >
              <PreviewBlock
                source={blockSource(block, definitions)}
                headingIds={blockHeadings.get(block.key) ?? ""}
              />
            </div>
          ))
        )}
      </ScrollArea>
    </PreviewContext>
  );
}
