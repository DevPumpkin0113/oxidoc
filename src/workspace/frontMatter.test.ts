import { describe, expect, it } from "vitest";
import { BOM, parseFrontMatter } from "./frontMatter";
import { splitBlocks } from "./markdownBlocks";
import { documentLinks, headings, markdownCodeRegions } from "./markdown";
import { frontMatterDecorations } from "./editorFrontMatter";

const DOCUMENT = [
  "---",
  "title: 문서 제목",
  "tags:",
  "  - a",
  "  - b",
  "# YAML 주석",
  "link: '[x](missing.md)'",
  "---",
  "",
  "# 본문",
  "",
  "[링크](other.md)",
].join("\n");

describe("front matter", () => {
  it("맨 앞 블록을 속성으로 읽고 중첩 줄은 값에 합침", () => {
    expect(parseFrontMatter(DOCUMENT)).toEqual({
      body: DOCUMENT.split("\n").slice(1, 7).join("\n"),
      endLine: 8,
      entries: [
        { key: "title", value: "문서 제목" },
        { key: "tags", value: "- a\n- b" },
        { key: "link", value: "'[x](missing.md)'" },
      ],
    });
  });

  it("`...` 닫기·BOM·CRLF·빈 블록 허용", () => {
    expect(parseFrontMatter("---\na: 1\n...\n본문")?.endLine).toBe(3);
    expect(parseFrontMatter(`${BOM}---\na: 1\n---`)?.entries).toEqual([
      { key: "a", value: "1" },
    ]);
    expect(parseFrontMatter("---\r\na: 1\r\n---\r\n")?.entries).toEqual([
      { key: "a", value: "1" },
    ]);
    expect(parseFrontMatter("---\n---\n# 본문")).toMatchObject({
      body: "",
      endLine: 2,
      entries: [],
    });
  });

  it("닫히지 않았거나 맨 앞이 아니면 front matter가 아님", () => {
    expect(parseFrontMatter("---\ntitle: x\n\n# 본문")).toBeNull();
    expect(parseFrontMatter("\n---\na: 1\n---")).toBeNull();
    expect(parseFrontMatter("----\na: 1\n----")).toBeNull();
    expect(parseFrontMatter("# 제목\n\n---\n\n본문\n\n---")).toBeNull();
  });

  it("블록 분할·개요·링크·코드 영역에서 제외하고 본문 줄 번호 유지", () => {
    const split = splitBlocks(DOCUMENT);
    expect(split.frontMatter?.endLine).toBe(8);
    expect(split.blocks.map((block) => [block.line, block.text])).toEqual([
      [10, "# 본문"],
      [12, "[링크](other.md)"],
    ]);
    expect(headings(DOCUMENT)).toEqual([
      { title: "본문", depth: 1, line: 10, id: "본문" },
    ]);
    expect(documentLinks(DOCUMENT).links.map((link) => link.href)).toEqual([
      "other.md",
    ]);
    expect(markdownCodeRegions("---\na: `x`\n---\n`y`")).toEqual([
      { startLine: 4, startColumn: 1, endLine: 4, endColumn: 4 },
    ]);
  });

  it("각주 문서도 front matter를 빼고 본문 줄부터 시작", () => {
    const content = "---\na: 1\n---\n\n본문[^1]\n\n[^1]: 각주";
    expect(splitBlocks(content).blocks).toEqual([
      {
        text: "본문[^1]\n\n[^1]: 각주",
        line: 5,
        key: "본문[^1]\n\n[^1]: 각주",
      },
    ]);
  });

  it("닫히지 않은 front matter와 본문 중간 `---`는 Markdown 그대로", () => {
    const unclosed = "---\ntitle: x\n\n# 본문";
    expect(splitBlocks(unclosed).frontMatter).toBeUndefined();
    expect(headings(unclosed).map((heading) => heading.line)).toEqual([4]);
    const middle = "---\na: 1\n---\n\n문단\n\n---\n\n끝";
    expect(splitBlocks(middle).blocks.map((block) => block.text)).toEqual([
      "문단",
      "---",
      "끝",
    ]);
  });

  it("편집기 장식: 구분선·본문·키 범위", () => {
    const lines = ["---", "title: x", "  - nested", "---", "# 본문"];
    expect(
      frontMatterDecorations(lines).map(({ range, options }) => [
        range.startLineNumber,
        range.startColumn,
        range.endColumn,
        options.inlineClassName,
      ]),
    ).toEqual([
      [1, 1, 4, "oxidoc-front-matter-delimiter"],
      [4, 1, 4, "oxidoc-front-matter-delimiter"],
      [2, 1, 9, "oxidoc-front-matter"],
      [2, 1, 6, "oxidoc-front-matter-key"],
      [3, 1, 11, "oxidoc-front-matter"],
    ]);
    expect(frontMatterDecorations(["---", "title: x"])).toEqual([]);
  });
});
