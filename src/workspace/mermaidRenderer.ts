import DOMPurify from "dompurify";
import type { Theme } from "../settings/themes";

let renderId = 0;
let queue: Promise<unknown> = Promise.resolve();
export function renderDiagram(
  source: string,
  theme: Theme,
  fontSize: number,
  current: () => boolean,
) {
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (!current()) return;
      if (source.length > 50000)
        throw Error("Mermaid: maximum 50,000 characters");
      const { default: mermaid } = await import("mermaid");
      if (!current()) return;
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
        const viewBox = root
          .getAttribute("viewBox")
          ?.split(/[ ,]+/)
          .map(Number);
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
    });
  queue = task;
  return task;
}
