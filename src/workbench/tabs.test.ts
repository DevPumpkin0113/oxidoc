import { describe, expect, it } from "vitest";
import { dropIndex, tabHints } from "./tabs";

const doc = (folder: string, name = "README.md") => ({
  id: folder ? `${folder}/${name}` : name,
  name,
  folder,
});

describe("탭 이름 구분", () => {
  it("이름이 겹칠 때만 서로 구분되는 가장 짧은 폴더 경로를 표시", () => {
    const hints = tabHints([
      doc(""),
      doc("docs"),
      doc("app/docs"),
      doc("notes", "a.md"),
    ]);
    expect(hints.get("README.md")).toBe(".");
    expect(hints.get("docs/README.md")).toBe("docs");
    expect(hints.get("app/docs/README.md")).toBe("app/docs");
    expect(hints.has("notes/a.md")).toBe(false);
  });

  it("대소문자만 다른 이름도 같은 이름으로 보고 마지막 폴더로 구분", () => {
    const hints = tabHints([doc("a/x", "Note.md"), doc("b/y", "note.md")]);
    expect(hints.get("a/x/Note.md")).toBe("x");
    expect(hints.get("b/y/note.md")).toBe("y");
  });
});

describe("탭 놓을 위치", () => {
  it("끌어 온 탭을 뺀 순서 기준으로 대상 앞뒤 위치를 계산", () => {
    const ids = ["a", "b", "c", "d"];
    expect(dropIndex(ids, "a", "c", false)).toBe(1);
    expect(dropIndex(ids, "a", "c", true)).toBe(2);
    expect(dropIndex(ids, "d", "a", false)).toBe(0);
    expect(dropIndex(ids, "b", "missing", false)).toBe(3);
  });
});
