import { describe, expect, it } from "vitest";
import { headings, resolveLink } from "./markdown";
describe("Markdown 위치와 링크 경계", () => {
  it("접미사가 포함된 제목과 중복 제목의 앵커 충돌 방지", () => {
    const ids = headings("# hello\n\n# hello\n\n# hello-1\n\n# hello").map(
      (item) => item.id,
    );
    expect(new Set(ids).size).toBe(4);
  });
  it("코드 블록 제외, setext·인라인 서식·한글·중복 제목 개요", () => {
    expect(
      headings(
        "# 한글 **제목**\n\n```md\n# hidden\n```\n\n한글 제목\n---\n\n# 한글 제목",
      ),
    ).toEqual([
      { title: "한글 제목", depth: 1, line: 1, id: "한글-제목" },
      { title: "한글 제목", depth: 2, line: 7, id: "한글-제목-1" },
      { title: "한글 제목", depth: 1, line: 10, id: "한글-제목-2" },
    ]);
  });
  it("상대 경로·부모 경로·인코딩된 앵커 해석", () => {
    expect(resolveLink("docs/a.md", "../images/a%20b.png")).toEqual({
      kind: "local",
      path: "images/a b.png",
      hash: "",
    });
    expect(resolveLink("docs/a.md", "b.md#%ED%95%9C%EA%B8%80")).toEqual({
      kind: "local",
      path: "docs/b.md",
      hash: "한글",
    });
    expect(resolveLink("a.md", "#hello")).toEqual({
      kind: "anchor",
      hash: "hello",
    });
    expect(resolveLink("a.md", "https://example.com").kind).toBe("external");
  });
  it.each([
    "../secret",
    "%2e%2e/secret",
    "/etc/passwd",
    "file:///C:/secret",
    "javascript:alert(1)",
    "data:image/svg+xml,x",
    "//evil.com/a",
    "a%5cb",
    "%00",
    "https://[",
    "%zz",
  ])("차단 경로 %s", (href) => {
    expect(resolveLink("a.md", href)).toEqual({ kind: "blocked" });
  });
});
