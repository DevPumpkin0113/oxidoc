import DOMPurify from "dompurify";
import type { Theme } from "../settings/themes";
import { lruCache } from "./markdownBlocks";

export type DiagramResult =
  { image: string; error?: never } | { error: string; image?: never };

const MAX_SOURCE_CHARS = 50_000;
// Finished renders by source, theme and size: preview blocks remount while
// typing, and an unchanged diagram should not render again.
const results = lruCache<DiagramResult>(100);
const resultKey = (source: string, theme: Theme, fontSize: number) =>
  JSON.stringify([source, theme.id, fontSize]);

export const cachedDiagram = (source: string, theme: Theme, fontSize: number) =>
  results.get(resultKey(source, theme, fontSize));

let renderId = 0;
let configured = "";
let queue: Promise<unknown> = Promise.resolve();
/** Renders a diagram to an SVG data URL; resolves undefined when no longer current. */
export function renderDiagram(
  source: string,
  theme: Theme,
  fontSize: number,
  current: () => boolean,
): Promise<string | undefined> {
  const key = resultKey(source, theme, fontSize);
  const cached = results.get(key);
  if (cached)
    return "image" in cached
      ? Promise.resolve(cached.image)
      : Promise.reject(Error(cached.error));
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (!current()) return undefined;
      try {
        const image = await render(source, theme, fontSize, current);
        if (image !== undefined) results.set(key, { image });
        return image;
      } catch (error) {
        results.set(key, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  queue = task;
  return task;
}

async function render(
  source: string,
  theme: Theme,
  fontSize: number,
  current: () => boolean,
) {
  if (source.length > MAX_SOURCE_CHARS)
    throw Error("Mermaid: maximum 50,000 characters");
  const { default: mermaid } = await import("mermaid");
  if (!current()) return undefined;
  // Settings are the same for every diagram until the theme or size changes.
  const config = JSON.stringify([theme.id, fontSize]);
  if (config !== configured) {
    configured = config;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
      maxTextSize: 50000,
      maxEdges: 500,
      theme: "base",
      darkMode: theme.kind === "dark",
      fontFamily: "Arial, Malgun Gothic, sans-serif",
      themeVariables: {
        darkMode: theme.kind === "dark",
        background: theme.background,
        primaryColor: theme.surface,
        primaryTextColor: theme.text,
        primaryBorderColor: theme.accent,
        lineColor: theme.muted,
        secondaryColor: theme.surface,
        tertiaryColor: theme.background,
        fontSize: `${fontSize}px`,
      },
      flowchart: { htmlLabels: false },
      secure: [
        "secure",
        "suppressErrorRendering",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "maxEdges",
        "htmlLabels",
        "themeCSS",
        "theme",
        "themeVariables",
        "flowchart",
        "fontFamily",
        "dompurifyConfig",
      ],
    });
  }
  const container = document.createElement("div");
  container.style.cssText =
    "position:absolute;left:-100000px;top:0;visibility:hidden";
  document.body.append(container);
  try {
    const { svg } = await mermaid.render(
      `oxidoc-mermaid-${++renderId}`,
      source,
      container,
    );
    const safe = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["foreignObject", "script"],
      FORBID_ATTR: ["href", "xlink:href"],
    });
    const xml = new DOMParser().parseFromString(safe, "image/svg+xml");
    const root = xml.documentElement;
    const viewBox = root.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
    if (
      viewBox?.length === 4 &&
      viewBox.every(Number.isFinite) &&
      viewBox[2] > 0 &&
      viewBox[3] > 0
    ) {
      root.setAttribute("width", String(viewBox[2]));
      root.setAttribute("height", String(viewBox[3]));
    }
    // SVG is displayed as an image, keeping its styles and contents isolated
    // from the application's DOM. Interactive diagram links are not bound.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
  } finally {
    container.remove();
  }
}
