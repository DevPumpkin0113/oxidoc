import { describe, expect, it } from "vitest";
import { splitBlocks } from "./markdownBlocks";
import { documentLinks, headings, markdownCodeRegions } from "./markdown";
import { sampleDocuments } from "../data/sampleDocuments";

/** Forces whole-document parsing (footnote marker inside a skipped comment). */
const whole = (content: string) => `${content}\n\n<!-- [^ -->`;

const TRICKY = [
  "# Title",
  "",
  "Para with [ref][r] and [direct](a.md) and `code`.",
  "",
  "- item 1",
  "",
  "- item 2",
  "",
  "  continued para",
  "",
  "1. one",
  "",
  "2. two",
  "",
  "```js",
  "a",
  "",
  "b",
  "```",
  "",
  "> quote",
  "",
  "Setext",
  "===",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | [t](t.md) |",
  "",
  "---",
  "",
  "after hr",
  "",
  "<!-- comment",
  "",
  "still comment -->",
  "",
  "    indented code",
  "",
  "    more",
  "",
  "[r]: https://example.com",
  "",
  "# Title",
].join("\n");

describe("Markdown 블록 분할", () => {
  it("빈 줄로 나누되 코드 펜스·주석 안, 목록 항목·들여쓴 줄 앞에서는 나누지 않음", () => {
    const { blocks, definitions } = splitBlocks(TRICKY);
    const starts = blocks.map((block) => block.text.split("\n")[0]);
    expect(starts).toEqual([
      "# Title",
      // List items and indented continuations stay with the preceding block.
      "Para with [ref][r] and [direct](a.md) and `code`.",
      "```js",
      "> quote",
      "Setext",
      "| a | b |",
      "---",
      "after hr",
      "<!-- comment",
      "[r]: https://example.com",
      "# Title",
    ]);
    expect(blocks[1].text).toContain("  continued para");
    expect(blocks[1].text).toContain("2. two");
    expect(blocks[2].text).toBe("```js\na\n\nb\n```");
    expect(blocks[8].text).toContain("    more");
    expect(blocks.map((block) => block.line)).toEqual([
      1, 3, 15, 21, 23, 26, 30, 32, 34, 42, 44,
    ]);
    expect(definitions).toBe("[r]: https://example.com");
    expect(new Set(blocks.map((block) => block.key)).size).toBe(blocks.length);
  });

  it("각주가 있으면 문서 전체를 한 블록으로 유지", () => {
    const content = "a[^1]\n\nb\n\n[^1]: note";
    expect(splitBlocks(content).blocks).toEqual([
      { text: content, line: 1, key: content },
    ]);
    expect(splitBlocks("").blocks).toEqual([]);
  });

  it("블록 단위 분석 결과가 문서 전체 분석과 같음", () => {
    for (const content of [TRICKY, ...sampleDocuments.map((d) => d.content)]) {
      expect(headings(content)).toEqual(headings(whole(content)));
      expect(documentLinks(content)).toEqual(documentLinks(whole(content)));
      expect(markdownCodeRegions(content)).toEqual(
        markdownCodeRegions(whole(content)),
      );
    }
    expect(headings(TRICKY).map((heading) => heading.id)).toEqual([
      "title",
      "setext",
      "title-1",
    ]);
  });
});
