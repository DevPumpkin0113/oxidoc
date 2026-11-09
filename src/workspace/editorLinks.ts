import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { workspaceApi } from "./api";
import { useWorkspace, sameDocumentPath } from "./store";
import {
  documentLinks,
  markdownCodeRegions,
  headings,
  resolveLink,
  type DocumentLink,
} from "./markdown";
import { relativeAssetPath } from "./editorImages";
import { t } from "../settings/i18n";

interface LinkDiagnostic extends DocumentLink {
  message: string;
}
export async function diagnoseLinks(
  documentId: string,
  content: string,
  exists: (paths: string[]) => Promise<Set<string>>,
): Promise<LinkDiagnostic[]> {
  const parsed = documentLinks(content);
  const targets = parsed.links.map((link) => ({
    link,
    target: resolveLink(documentId, link.href),
  }));
  const paths = [
    ...new Set(
      targets.flatMap(({ target }) =>
        target.kind === "local" ? [target.path] : [],
      ),
    ),
  ];
  const found = await exists(paths);
  const present = (path: string) =>
    [...found].some((candidate) => sameDocumentPath(candidate, path));
  const anchors = new Set(headings(content).map((heading) => heading.id));
  const results: LinkDiagnostic[] = [];
  for (const { link, target } of targets) {
    if (/^(mailto|tel):/i.test(link.href)) continue;
    const message =
      target.kind === "blocked"
        ? t("프로젝트 외부 또는 지원하지 않는 링크입니다.")
        : target.kind === "local" && !present(target.path)
          ? t("연결된 파일을 찾거나 접근할 수 없습니다.")
          : target.kind === "anchor" && target.hash && !anchors.has(target.hash)
            ? t("연결된 제목을 찾을 수 없습니다.")
            : "";
    if (message) results.push({ ...link, message });
  }
  if (parsed.truncated)
    results.push({
      href: "",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 2,
      message: t("최대 500개 링크만 검사합니다."),
    });
  return results;
}

const fileCache = new Map<
  string,
  {
    time: number;
    task: ReturnType<NonNullable<typeof workspaceApi.advanced>["index"]>;
  }
>();
async function indexedFiles(root: string) {
  const state = useWorkspace.getState();
  if (!state.desktop)
    return Object.values(state.tree)
      .flat()
      .filter((entry) => !entry.isDirectory);
  let cached = fileCache.get(root);
  if (!cached || Date.now() - cached.time > 5000) {
    cached = { time: Date.now(), task: workspaceApi.advanced!.index(root) };
    fileCache.set(root, cached);
  }
  try {
    return (await cached.task).entries;
  } catch (error) {
    fileCache.delete(root);
    throw error;
  }
}

export function attachMarkdownLinks(
  monaco: typeof Monaco,
  instance: Monaco.editor.IStandaloneCodeEditor,
  root: string,
  documentId: string,
) {
  const model = instance.getModel();
  if (!model) return () => {};
  let disposed = false,
    running = false,
    rerun = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let codeVersion = -1;
  let codeRegions: ReturnType<typeof markdownCodeRegions> = [];
  async function validate() {
    if (disposed || model!.isDisposed()) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    const version = model!.getVersionId();
    const current = () =>
      !disposed &&
      !model!.isDisposed() &&
      instance.getModel() === model &&
      model!.getVersionId() === version &&
      useWorkspace.getState().project?.path === root;
    try {
      const diagnostics = await diagnoseLinks(
        documentId,
        model!.getValue(),
        async (paths) => {
          const state = useWorkspace.getState();
          if (!state.desktop)
            return new Set(
              Object.values(state.tree)
                .flat()
                .map((entry) => entry.path),
            );
          if (!paths.length) return new Set<string>();
          return new Set(
            (await workspaceApi.advanced!.probe(root, paths))
              .filter((item) => item.stamp !== null)
              .map((item) => item.path),
          );
        },
      );
      if (current())
        monaco.editor.setModelMarkers(
          model!,
          "oxidoc-links",
          diagnostics.map((link) => ({
            startLineNumber: link.line,
            startColumn: link.column,
            endLineNumber: link.endLine,
            endColumn: link.endColumn,
            message: link.message,
            severity: monaco.MarkerSeverity.Warning,
          })),
        );
    } catch (error) {
      if (current())
        monaco.editor.setModelMarkers(model!, "oxidoc-links", [
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 2,
            severity: monaco.MarkerSeverity.Info,
            message: `${t("링크 확인 실패")}: ${String(error)}`,
          },
        ]);
    } finally {
      running = false;
      if (rerun && !disposed) {
        rerun = false;
        schedule();
      }
    }
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void validate(), 400);
  }
  const changes = model.onDidChangeContent(schedule);
  const unsubscribe = useWorkspace.subscribe((state, previous) => {
    if (
      state.tree !== previous.tree ||
      state.generation !== previous.generation
    ) {
      fileCache.delete(root);
      schedule();
    }
  });
  const interval = setInterval(() => void validate(), 5000);
  schedule();
  const completion = monaco.languages.registerCompletionItemProvider(
    "markdown",
    {
      triggerCharacters: ["(", "/", "#"],
      provideCompletionItems: async (
        candidate,
        position,
        _context,
        cancellation,
      ) => {
        if (candidate !== model || disposed) return { suggestions: [] };
        const line = model
          .getLineContent(position.lineNumber)
          .slice(0, position.column - 1);
        const context = /!?\[[^\]]*\]\(\s*(?:<([^>]*)|([^)]*))$/.exec(line);
        if (!context) return { suggestions: [] };
        if (codeVersion !== model.getVersionId()) {
          codeVersion = model.getVersionId();
          codeRegions = markdownCodeRegions(model.getValue());
        }
        if (
          codeRegions.some(
            (region) =>
              (position.lineNumber > region.startLine ||
                (position.lineNumber === region.startLine &&
                  position.column >= region.startColumn)) &&
              (position.lineNumber < region.endLine ||
                (position.lineNumber === region.endLine &&
                  position.column < region.endColumn)),
          )
        )
          return { suggestions: [] };
        const prefix = context[1] ?? context[2];
        const decoded = (path: string) => {
          try {
            return decodeURIComponent(path);
          } catch {
            return path;
          }
        };
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - prefix.length,
          endColumn: position.column,
        };
        try {
          if (prefix.includes("#")) {
            const pathPart = prefix.slice(0, prefix.indexOf("#"));
            let content = model.getValue();
            if (pathPart) {
              const target = resolveLink(documentId, pathPart);
              if (target.kind !== "local") return { suggestions: [] };
              if (!sameDocumentPath(target.path, documentId)) {
                const state = useWorkspace.getState();
                const opened = state.documents.find((document) =>
                  sameDocumentPath(document.id, target.path),
                );
                content =
                  opened?.content ??
                  (state.desktop
                    ? await workspaceApi.read(root, target.path)
                    : "");
              }
            }
            if (disposed || cancellation.isCancellationRequested)
              return { suggestions: [] };
            return {
              suggestions: headings(content)
                .filter((heading) =>
                  heading.id
                    .toLowerCase()
                    .includes(
                      decoded(
                        prefix.slice(prefix.indexOf("#") + 1),
                      ).toLowerCase(),
                    ),
                )
                .map((heading) => ({
                  label: heading.title,
                  detail: `#${heading.id}`,
                  kind: monaco.languages.CompletionItemKind.Reference,
                  insertText: `${pathPart}#${encodeURIComponent(heading.id)}`,
                  filterText: `${prefix} ${pathPart}#${heading.id}`,
                  range,
                })),
            };
          }
          if (/^[a-z][a-z\d+.-]*:/i.test(prefix) || prefix.startsWith("/"))
            return { suggestions: [] };
          const files = await indexedFiles(root);
          if (disposed || cancellation.isCancellationRequested)
            return { suggestions: [] };
          const image = /!\[[^\]]*\]\(/.test(context[0]);
          return {
            suggestions: files
              .filter(
                (entry) =>
                  !image ||
                  /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(entry.name),
              )
              .filter((entry) =>
                decoded(relativeAssetPath(documentId, entry.path))
                  .toLowerCase()
                  .includes(decoded(prefix).toLowerCase()),
              )
              .slice(0, 2000)
              .map((entry) => {
                const path = relativeAssetPath(documentId, entry.path);
                return {
                  label: decoded(path),
                  detail: entry.path,
                  kind: monaco.languages.CompletionItemKind.File,
                  insertText: path,
                  filterText: `${prefix} ${decoded(path)}`,
                  range,
                };
              }),
          };
        } catch {
          return { suggestions: [] };
        }
      },
    },
  );
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    clearInterval(interval);
    unsubscribe();
    changes.dispose();
    completion.dispose();
    fileCache.delete(root);
    if (!model.isDisposed())
      monaco.editor.setModelMarkers(model, "oxidoc-links", []);
  };
}
