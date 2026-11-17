import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import MarkdownPreview from "./MarkdownPreview";

const html = (content: string) => {
  const { container, unmount } = render(<MarkdownPreview content={content} />);
  const article = container.querySelector("article")!;
  const result = {
    article,
    text: article.textContent ?? "",
    markup: article.innerHTML,
  };
  unmount();
  return result;
};

it("허용 목록의 HTML 태그는 표시하고 그 안의 Markdown도 렌더링", () => {
  const { container } = render(
    <MarkdownPreview
      content={[
        "<details open>",
        "<summary>펼치기</summary>",
        "",
        "- **굵게** 항목",
        "",
        "</details>",
        "",
        "누르기 <kbd>Ctrl</kbd>+<kbd>S</kbd>, H<sub>2</sub>O, x<sup>2</sup>, <mark>강조</mark><br>다음 줄",
      ].join("\n")}
    />,
  );
  const article = container.querySelector("article")!;
  const details = article.querySelector("details")!;
  expect(details).toHaveAttribute("open");
  expect(details.querySelector("summary")).toHaveTextContent("펼치기");
  expect(details.querySelector("li strong")).toHaveTextContent("굵게");
  expect(article.querySelectorAll("kbd")).toHaveLength(2);
  expect(article.querySelector("sub")).toHaveTextContent("2");
  expect(article.querySelector("sup")).toHaveTextContent("2");
  expect(article.querySelector("mark")).toHaveTextContent("강조");
  expect(article.querySelector("p br")).not.toBeNull();
});

it("스크립트·스타일·이벤트 속성·임베드·폼은 차단하고 허용 밖 태그는 글자만 남김", () => {
  const { article, text, markup } = html(
    [
      '<script>alert("x")</script><style>body{display:none}</style>',
      "",
      '<p onclick="alert(1)" style="color:red" class="app" align="center">문단</p>',
      "",
      '<iframe src="https://example.com">프레임</iframe><object data="x.swf">개체</object>',
      "",
      '<form action="https://example.com"><input type="text" value="입력"><button>보내기</button></form>',
      "",
      '<a href="javascript:alert(1)">링크</a> <span title="설명">글자</span> <custom-tag>사용자 태그</custom-tag>',
      "",
      "<svg><text>그림</text></svg><math><mi>x</mi></math>",
    ].join("\n"),
  );
  expect(
    article.querySelector(
      "script, style, iframe, object, form, input, button, svg, math",
    ),
  ).toBeNull();
  expect(markup).not.toMatch(/onclick|alert\(|style=|class="app"|javascript:/);
  expect(text).not.toMatch(/alert|display:none|프레임|개체|그림/);
  const paragraph = [...article.querySelectorAll("p")].find(
    (item) => item.textContent === "문단",
  )!;
  expect(paragraph).toHaveAttribute("align", "center");
  expect(text).toContain("보내기");
  expect(text).toContain("사용자 태그");
  expect(article.querySelector("span[title='설명']")).toHaveTextContent("글자");
  expect(article.querySelector("custom-tag")).toBeNull();
});

it("HTML이 섞인 작업 목록의 체크 상자는 유지", () => {
  const { article } = html("- [x] 완료 <kbd>K</kbd>\n- [ ] 할 일");
  const boxes = article.querySelectorAll<HTMLInputElement>(
    "li input[type=checkbox]",
  );
  expect(boxes).toHaveLength(2);
  expect(boxes[0].checked).toBe(true);
  expect(boxes[0].disabled).toBe(true);
  expect(boxes[1].checked).toBe(false);
});

it("HTML 주석과 인라인 코드 속 태그는 그대로 다룸", () => {
  const { article, text } = html(
    "<!-- 숨김 -->\n\n`<kbd>코드</kbd>` 와 <kbd>키</kbd>",
  );
  expect(text).not.toContain("숨김");
  expect(article.querySelector("code")).toHaveTextContent("<kbd>코드</kbd>");
  expect(article.querySelectorAll("kbd")).toHaveLength(1);
});
