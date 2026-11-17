import { expect, it } from "vitest";
import {
  activeConditions,
  defaultSearchOptions,
  pathFilter,
  queryPattern,
  toggledByShortcut,
} from "./searchOptions";

it("파일 패턴은 데스크톱 검색과 같은 규칙으로 포함·제외", () => {
  const included = pathFilter({
    ...defaultSearchOptions,
    include: "*.md, docs/**/*.txt",
    exclude: "drafts, docs/old/**",
  });
  for (const [path, expected] of [
    ["a.md", true],
    ["notes/deep/B.MD", true],
    ["a.mdx", false],
    ["docs/sub/x.txt", true],
    ["other/docs/x.txt", false],
    ["notes/drafts/a.md", false],
    ["notes/drafts.md", true],
    ["docs/old/a.md", false],
    ["한글 폴더/메모.md", true],
  ] as const)
    expect(included(path), path).toBe(expected);
  expect(pathFilter(defaultSearchOptions)("any/path")).toBe(true);
});

it("일반·정규식·단어 단위 검색 패턴과 조건 요약·단축키", () => {
  const found = (query: string, options = {}) =>
    [
      ..."a.b axb 단어 단어들 Word".matchAll(
        queryPattern(query, { ...defaultSearchOptions, ...options }),
      ),
    ].map((match) => match[0]);
  expect(found("a.b")).toEqual(["a.b"]);
  expect(found("a.b", { regex: true })).toEqual(["a.b", "axb"]);
  expect(found("단어", { wholeWord: true })).toEqual(["단어"]);
  expect(found("word", { caseSensitive: true })).toEqual([]);
  expect(() =>
    queryPattern("(", { ...defaultSearchOptions, regex: true }),
  ).toThrow();

  expect(
    activeConditions({
      ...defaultSearchOptions,
      regex: true,
      exclude: " a, ,b ",
    }),
  ).toEqual({ flags: ["정규식"], include: "", exclude: "a, b" });
  const key = { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
  expect(
    toggledByShortcut({ ...key, code: "KeyR" }, defaultSearchOptions)?.regex,
  ).toBe(true);
  expect(
    toggledByShortcut(
      { ...key, ctrlKey: true, code: "KeyR" },
      defaultSearchOptions,
    ),
  ).toBeNull();
  expect(
    toggledByShortcut({ ...key, code: "KeyX" }, defaultSearchOptions),
  ).toBeNull();
});
