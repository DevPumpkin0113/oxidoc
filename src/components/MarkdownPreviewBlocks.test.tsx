import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarkdownPreview from "./MarkdownPreview";
import { sampleDocuments } from "../data/sampleDocuments";

/** Forces whole-document rendering (footnote marker inside a skipped comment). */
const whole = (content: string) => `${content}\n\n<!-- [^ -->`;

/** Preview HTML with block wrappers removed and source lines made absolute. */
function normalized(content: string) {
  const { container, unmount } = render(<MarkdownPreview content={content} />);
  const article = container.querySelector("article")!;
  for (const wrapper of [
    ...article.querySelectorAll<HTMLElement>("[data-line-offset]"),
  ]) {
    const offset = Number(wrapper.dataset.lineOffset);
    for (const node of wrapper.querySelectorAll<HTMLElement>(
      "[data-source-line]",
    ))
      node.dataset.sourceLine = String(
        Number(node.dataset.sourceLine) + offset,
      );
    wrapper.replaceWith(...wrapper.childNodes);
  }
  // Line breaks between top-level block elements do not render.
  for (const node of [...article.childNodes])
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())
      node.remove();
  const html = article.innerHTML;
  unmount();
  return html;
}

const TRICKY = [
  "# Title",
  "",
  "Para with [ref][r], [direct](a.md) and `code`.",
  "",
  "- item 1",
  "",
  "- item 2",
  "",
  "  continued",
  "",
  "```js",
  "a",
  "",
  "b",
  "```",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "---",
  "",
  "after hr",
  "",
  "[r]: https://example.com",
  "",
  "## Title",
].join("\n");

const HTML = [
  "<details>",
  "<summary>요약</summary>",
  "",
  "- [x] 완료 <kbd>K</kbd>",
  "- [ ] 할 일",
  "",
  '<div align="center">',
  "",
  "본문",
  "",
  "</div>",
  "</details>",
  "",
  "`<details>` 는 코드",
  "",
  "끝",
].join("\n");

describe("블록 단위 미리보기", () => {
  it("블록 렌더링 결과가 문서 전체 렌더링과 같음", () => {
    for (const content of [
      TRICKY,
      HTML,
      ...sampleDocuments.map((d) => d.content),
    ])
      expect(normalized(content)).toBe(normalized(whole(content)));
  });

  it("큰 문서는 앞부분부터 점진 렌더링하고, 아직 없는 위치로 이동하면 먼저 렌더링", async () => {
    const content = Array.from(
      { length: 200 },
      (_, index) => `Paragraph ${index}`,
    ).join("\n\n");
    const { container, rerender } = render(
      <MarkdownPreview content={content} />,
    );
    const count = () => container.querySelectorAll("p").length;
    expect(count()).toBe(40);
    rerender(
      <MarkdownPreview
        content={content}
        navigation={{ line: 301, token: 1 }}
      />,
    );
    // Line 301 is paragraph 150; it renders before the background batches reach it.
    expect(count()).toBeGreaterThanOrEqual(151);
    await waitFor(() => expect(count()).toBe(200));
  });

  it("다른 블록을 고치거나 위에 줄을 추가해도 기존 블록 DOM을 재사용", () => {
    const first = "# One\n\nAlpha paragraph";
    const { container, rerender } = render(
      <MarkdownPreview content={`${first}\n\nBeta`} />,
    );
    const alpha = container.querySelector("p")!;
    rerender(<MarkdownPreview content={`${first}\n\nBeta edited`} />);
    expect(container.querySelector("p")).toBe(alpha);

    rerender(<MarkdownPreview content={`Intro\n\n${first}\n\nBeta edited`} />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs[1]).toBe(alpha);
    const wrapper = alpha.parentElement as HTMLElement;
    expect(
      Number(wrapper.dataset.lineOffset) + Number(alpha.dataset.sourceLine),
    ).toBe(5);
    expect(container.querySelector("h1")).toHaveAttribute("id", "one");
  });

  it("front matter는 접힌 속성 표로 보이고 구분선·제목이 되지 않음", () => {
    const { container } = render(
      <MarkdownPreview
        content={[
          "---",
          "title: 문서",
          "tags: a",
          "---",
          "",
          "# 본문",
          "",
          "문단",
        ].join("\n")}
      />,
    );
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveAttribute("data-source-line", "1");
    expect(details.querySelector("summary")).toHaveTextContent("속성2");
    expect(
      [...details.querySelectorAll("tr")].map((row) => row.textContent),
    ).toEqual(["title문서", "tagsa"]);
    expect(container.querySelector("hr")).toBeNull();
    expect(container.querySelectorAll("h1, h2")).toHaveLength(1);
    const heading = container.querySelector("h1")!;
    const wrapper = heading.parentElement as HTMLElement;
    expect(
      Number(wrapper.dataset.lineOffset) + Number(heading.dataset.sourceLine),
    ).toBe(6);
  });

  it("키가 없는 front matter는 원문을 표시", () => {
    const { container } = render(
      <MarkdownPreview
        content={["---", "- a", "- b", "---", "본문"].join("\n")}
      />,
    );
    expect(container.querySelector("details pre")).toHaveTextContent("- a - b");
  });
});
