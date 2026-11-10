import { translateError, t } from "../settings/i18n";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  createElement,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { workspaceApi } from "../workspace/api";
import {
  headings,
  resolveLink,
  sourceLines,
  type LinkTarget,
} from "../workspace/markdown";
import styles from "../App.module.css";
import MermaidDiagram from "./MermaidDiagram";
import { isMermaidFile } from "../workspace/documentTypes";
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
  headings: ReturnType<typeof headings>;
  follow: (href: string) => void;
}
const PreviewContext = createContext<PreviewContextValue | null>(null);
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
  const context = useContext(PreviewContext)!;
  return createElement(
    node?.tagName ?? "h2",
    {
      id: context.headings.find(
        (heading) => heading.line === node?.position?.start.line,
      )?.id,
      "data-source-line": node?.position?.start.line,
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
  if (
    code?.tagName === "code" &&
    Array.isArray(classes) &&
    classes.includes("language-mermaid")
  ) {
    return (
      <MermaidDiagram
        line={node?.position?.start.line}
        source={
          code.children
            ?.map((child) => child.value ?? "")
            .join("")
            .replace(/\n$/, "") ?? ""
        }
      />
    );
  }
  return <pre data-source-line={node?.position?.start.line}>{children}</pre>;
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
  const allHeadings = useMemo(
    () => (standalone ? [] : headings(content)),
    [content, standalone],
  );
  const totalLines = content.split("\n").length;
  function scrollTo(line: number, edge?: ScrollEdge) {
    const container = article.current;
    if (!container) return;
    if (edge) {
      setScroll(
        edge === "end"
          ? Math.max(0, container.scrollHeight - container.clientHeight)
          : 0,
      );
      return;
    }
    const nodes = Array.from(container.children).filter((node) =>
      node.hasAttribute("data-source-line"),
    ) as HTMLElement[];
    let before = nodes[0],
      after: HTMLElement | undefined;
    for (const node of nodes) {
      if (Number(node.dataset.sourceLine) <= line) before = node;
      else {
        after = node;
        break;
      }
    }
    if (!before) return;
    const top =
      before.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    const end = after
      ? after.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop
      : container.scrollHeight;
    const startLine = Number(before.dataset.sourceLine) || 1;
    const endLine = after ? Number(after.dataset.sourceLine) : totalLines + 1;
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
    for (const node of article.current.children) observer.observe(node);
    return () => observer.disconnect();
  }, [syncTarget, content]);
  useEffect(() => {
    if (navigation) {
      scrollRef.current(navigation.line);
      notifyNavigation(navigation.line);
    }
  }, [navigation, documentPath]);
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
    if (edge) {
      onScrollLine(edge === "end" ? totalLines : 1, edge);
      return;
    }
    const nodes = Array.from(container.children).filter((node) =>
      node.hasAttribute("data-source-line"),
    ) as HTMLElement[];
    let before = nodes[0],
      after: HTMLElement | undefined;
    for (const node of nodes) {
      if (
        node.getBoundingClientRect().top -
          container.getBoundingClientRect().top <=
        2
      )
        before = node;
      else {
        after = node;
        break;
      }
    }
    if (!before) {
      onScrollLine(1);
      return;
    }
    const start = Number(before.dataset.sourceLine) || 1;
    const end = after ? Number(after.dataset.sourceLine) : totalLines + 1;
    const top =
      before.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    const bottom = after
      ? after.getBoundingClientRect().top -
        container.getBoundingClientRect().top
      : container.scrollHeight - container.scrollTop;
    onScrollLine(
      start +
        (end - start) *
          Math.max(0, Math.min(1, -top / Math.max(1, bottom - top))),
    );
  }
  function follow(href: string) {
    const target = resolveLink(documentPath, href);
    if (target.kind === "anchor") {
      const heading = allHeadings.find((heading) => heading.id === target.hash);
      if (heading) {
        scrollTo(heading.line);
        onScrollLine?.(heading.line);
      }
    } else onNavigate?.(target);
  }
  return (
    <PreviewContext
      value={{ root, documentPath, desktop, headings: allHeadings, follow }}
    >
      <article
        ref={article}
        className={styles.preview}
        aria-label={t(standalone ? "Mermaid 미리보기" : "Markdown 미리보기")}
        onScroll={onScroll}
      >
        {standalone ? (
          <MermaidDiagram source={content} line={1} />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[sourceLines]}
            skipHtml
            components={previewComponents}
          >
            {content}
          </ReactMarkdown>
        )}
      </article>
    </PreviewContext>
  );
}
