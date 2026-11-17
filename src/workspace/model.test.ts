import { describe, expect, it } from "vitest";
import {
  defaultLayout,
  isDirty,
  isDocumentUnder,
  parseLayout,
  parseSession,
  sameDocumentPath,
} from "./model";

describe("작업 공간 모델", () => {
  it("레이아웃·세션의 잘못된 값은 기본값으로, 경로는 대소문자·구분자 무시 중복 제거", () => {
    expect(parseLayout({ view: "bogus", sync: false, outline: 1 })).toEqual({
      ...defaultLayout,
      sync: false,
    });
    const session = parseSession(
      { paths: ["a/B.md", "A\\b.md", 3, "c.md"], activeId: 7 },
      defaultLayout,
    );
    expect(session).toEqual({
      paths: ["a/B.md", "c.md"],
      activeId: null,
      layout: defaultLayout,
    });
  });

  it("경로 비교·하위 판정과 미저장 판정", () => {
    expect(sameDocumentPath("Notes\\A.md", "notes/a.md")).toBe(true);
    expect(isDocumentUnder("dir/sub/a.md", "DIR")).toBe(true);
    expect(isDocumentUnder("directory/a.md", "dir")).toBe(false);
    const document = {
      id: "a.md",
      name: "a.md",
      folder: "",
      content: "x",
      savedContent: "x",
    };
    expect(isDirty(document)).toBe(false);
    expect(isDirty({ ...document, diskContent: null })).toBe(true);
    expect(isDirty({ ...document, content: "y" })).toBe(true);
  });
});
