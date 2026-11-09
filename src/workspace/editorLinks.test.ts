import { afterEach, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { diagnoseLinks, attachMarkdownLinks } from "./editorLinks";
import { documentLinks } from "./markdown";
import { workspaceApi } from "./api";
import { useWorkspace } from "./store";
afterEach(() => vi.restoreAllMocks());
it("코드 제외·참조 링크·이미지·해시·인코딩 경로·외부 경계 검사", async () => {
  const content = [
    "# Title",
    "[ok](other%20file.md#heading)",
    "![image](../assets/a%28b%29.png)",
    "[ref][target]",
    "",
    "[target]: missing.md",
    "",
    "[outside](../../escape.md)",
    "[web](https://example.com)",
    "[mail](mailto:a@example.com)",
    "[anchor](#title)",
    "[missing anchor](#absent)",
    "`[inline](ignore.md)`",
    "```md",
    "[fenced](ignore-too.md)",
    "```",
  ].join("\n");
  const exists = vi
    .fn()
    .mockResolvedValue(new Set(["docs/other file.md", "assets/a(b).png"]));
  const result = await diagnoseLinks("docs/a.md", content, exists);
  expect(exists).toHaveBeenCalledWith([
    "docs/other file.md",
    "assets/a(b).png",
    "docs/missing.md",
  ]);
  expect(result.map((link) => link.href)).toEqual([
    "missing.md",
    "../../escape.md",
    "#absent",
  ]);
  expect(
    documentLinks(content).links.some((link) => link.href.includes("ignore")),
  ).toBe(false);
  expect(
    await diagnoseLinks(
      "docs/a.md",
      "[created](new.md)",
      async () => new Set(["docs/new.md"]),
    ),
  ).toEqual([]);
  expect(
    await diagnoseLinks(
      "docs/a.md",
      "[deleted](new.md)",
      async () => new Set(),
    ),
  ).toHaveLength(1);
});
it("상대 경로·괄호 인코딩·이미지 전용 및 제목 앵커 자동 완성", async () => {
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
    },
    true,
  );
  vi.spyOn(workspaceApi.advanced!, "index").mockResolvedValue({
    entries: [
      { name: "other file.md", path: "docs/other file.md", isDirectory: false },
      { name: "a(b).png", path: "assets/a(b).png", isDirectory: false },
      { name: "문서.md", path: "docs/문서.md", isDirectory: false },
      { name: "blocked.svg", path: "assets/blocked.svg", isDirectory: false },
    ],
    truncated: false,
    skipped: 0,
  });
  let line = "[link](";
  let content = "# Title\n# 한글 제목";
  let version = 1;
  let lineNumber = 1;
  const model = {
    isDisposed: () => false,
    getValue: () => content,
    getVersionId: () => version,
    getLineContent: () => line,
    onDidChangeContent: () => ({ dispose: vi.fn() }),
  };
  const instance = { getModel: () => model };
  let provider: Monaco.languages.CompletionItemProvider | undefined;
  const monaco = {
    editor: { setModelMarkers: vi.fn() },
    MarkerSeverity: { Warning: 4, Info: 2 },
    languages: {
      CompletionItemKind: { File: 1, Reference: 2 },
      registerCompletionItemProvider: (
        _language: string,
        value: Monaco.languages.CompletionItemProvider,
      ) => {
        provider = value;
        return { dispose: vi.fn() };
      },
    },
  } as unknown as typeof Monaco;
  const stop = attachMarkdownLinks(
    monaco,
    instance as unknown as Monaco.editor.IStandaloneCodeEditor,
    "C:/notes",
    "docs/a.md",
  );
  const suggest = () =>
    provider!.provideCompletionItems(
      model as unknown as Monaco.editor.ITextModel,
      { lineNumber, column: line.length + 1 } as Monaco.Position,
      {} as Monaco.languages.CompletionContext,
      { isCancellationRequested: false } as Monaco.CancellationToken,
    );
  try {
    const files = await suggest();
    expect(files?.suggestions.map((item) => item.insertText)).toEqual([
      "other%20file.md",
      "../assets/a%28b%29.png",
      `${encodeURIComponent("문서")}.md`,
      "../assets/blocked.svg",
    ]);
    line = "![image](";
    expect(
      (await suggest())?.suggestions.map((item) => item.insertText),
    ).toEqual(["../assets/a%28b%29.png"]);
    line = "[heading](#";
    expect((await suggest())?.suggestions[0].insertText).toBe("#title");
    line = "[heading](#한";
    const koreanHeading = (await suggest())?.suggestions[0];
    expect(koreanHeading?.insertText).toBe(
      `#${encodeURIComponent("한글-제목")}`,
    );
    expect(koreanHeading?.filterText).toContain("한글-제목");
    line = "[link](문";
    expect(
      (await suggest())?.suggestions.map((item) => item.insertText),
    ).toEqual([`${encodeURIComponent("문서")}.md`]);
    line = "[link](other ";
    expect((await suggest())?.suggestions[0].insertText).toBe(
      "other%20file.md",
    );
    content = "```md\n[link](\n```";
    version++;
    lineNumber = 2;
    line = "[link](";
    expect((await suggest())?.suggestions).toEqual([]);
  } finally {
    stop();
  }
});
