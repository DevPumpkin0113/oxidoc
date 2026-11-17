import { describe, expect, it } from "vitest";
import {
  linkDestinations,
  movedPath,
  planLinkUpdates,
  updatedLinks,
} from "./linkUpdates";

const update = (path: string, content: string, from: string, to: string) =>
  updatedLinks(path, content, { from, to }).after;

describe("이동·이름 변경 시 Markdown 링크 갱신", () => {
  it("이동한 경로와 폴더 하위 경로를 대소문자 없이 재계산", () => {
    const move = { from: "Docs", to: "archive/docs" };
    expect(movedPath("docs/a.md", move)).toBe("archive/docs/a.md");
    expect(movedPath("docs", move)).toBe("archive/docs");
    expect(movedPath("docsx/a.md", move)).toBe("docsx/a.md");
  });

  it("다른 문서의 링크·이미지·참조 정의를 고치고 앵커·제목·외부 URL·코드는 유지", () => {
    const content = [
      '[A](docs/a.md#설치 "제목") ![그림](docs/img/p.png)',
      "[외부](https://example.com/docs/a.md) [앵커](#docs) [다른](b.md)",
      "`[코드](docs/a.md)`",
      "",
      "```md",
      "[펜스](docs/a.md)",
      "```",
      "",
      '[참조][r] <a href="docs/a.md">html</a>',
      "",
      "[r]: ./docs/a.md 'title'",
    ].join("\n");
    expect(update("index.md", content, "docs", "notes/docs")).toBe(
      [
        '[A](notes/docs/a.md#설치 "제목") ![그림](notes/docs/img/p.png)',
        "[외부](https://example.com/docs/a.md) [앵커](#docs) [다른](b.md)",
        "`[코드](docs/a.md)`",
        "",
        "```md",
        "[펜스](docs/a.md)",
        "```",
        "",
        '[참조][r] <a href="docs/a.md">html</a>',
        "",
        "[r]: ./notes/docs/a.md 'title'",
      ].join("\n"),
    );
  });

  it("이동한 문서 자신의 상대 링크를 새 위치 기준으로 바꾸고, 함께 이동한 대상은 그대로", () => {
    const content =
      "[형제](b.md) [상위](../root.md) [함께](sub/c.md) [이미지](../assets/x.png)";
    expect(update("docs/a.md", content, "docs", "archive/2025/docs")).toBe(
      "[형제](b.md) [상위](../../../root.md) [함께](sub/c.md) [이미지](../../../assets/x.png)",
    );
    expect(update("docs/a.md", content, "docs/a.md", "a.md")).toBe(
      "[형제](docs/b.md) [상위](root.md) [함께](docs/sub/c.md) [이미지](assets/x.png)",
    );
  });

  it("한글·공백·괄호 경로는 원래 표기 방식을 따라 인코딩", () => {
    expect(
      update(
        "index.md",
        "[a](old/%ED%95%9C.md) [b](old/한.md) [c](<old/한.md>)",
        "old/한.md",
        "새 폴더/한 (1).md",
      ),
    ).toBe(
      "[a](%EC%83%88%20%ED%8F%B4%EB%8D%94/%ED%95%9C%20%281%29.md) [b](새%20폴더/한%20%281%29.md) [c](<새 폴더/한 (1).md>)",
    );
  });

  it("CRLF·여러 블록·중첩 이미지 링크의 위치를 정확히 찾음", () => {
    const content = "# 제목\r\n\r\n[![i](a.png)](a.md)\r\n\r\n- [x](a.md)\r\n";
    expect(
      linkDestinations(content).map((found) =>
        content.slice(found.start, found.end),
      ),
    ).toEqual(["a.md", "a.png", "a.md"]);
    expect(update("r.md", content, "a.md", "d/a.md")).toBe(
      "# 제목\r\n\r\n[![i](a.png)](d/a.md)\r\n\r\n- [x](d/a.md)\r\n",
    );
  });

  it("바뀌는 Markdown 파일만 새 경로와 함께 계획", () => {
    const plan = planLinkUpdates(
      [
        { path: "index.md", text: "[a](docs/a.md)" },
        { path: "other.md", text: "[b](b.md)" },
        { path: "docs/a.md", text: "[i](../index.md)" },
        { path: "docs/notes.txt", text: "[a](a.md)" },
      ],
      { from: "docs", to: "x/docs" },
    );
    expect(plan.map((item) => [item.oldPath, item.path, item.after])).toEqual([
      ["index.md", "index.md", "[a](x/docs/a.md)"],
      ["docs/a.md", "x/docs/a.md", "[i](../../index.md)"],
    ]);
  });
});
