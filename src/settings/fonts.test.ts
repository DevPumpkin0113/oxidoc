import { expect, it } from "vitest";
import {
  cssFamilyName,
  pickable,
  replaceSegment,
  segmentAt,
  suggestFonts,
  type FontFamily,
} from "./fonts";

const family = (name: string, aliases: string[] = [], monospace = false) => ({
  name,
  aliases,
  monospace,
});

it("CSS 글꼴 이름은 일반 단어면 그대로, 숫자로 시작하는 단어가 있으면 따옴표", () => {
  expect(cssFamilyName("Cascadia Code")).toBe("Cascadia Code");
  expect(cssFamilyName("D2Coding")).toBe("D2Coding");
  expect(cssFamilyName("맑은 고딕")).toBe("맑은 고딕");
  expect(cssFamilyName("3270 Nerd Font")).toBe("'3270 Nerd Font'");
  expect(cssFamilyName("Font.Name")).toBe("'Font.Name'");
  expect(
    pickable([family("Ok Font"), family("Bad+Font"), family("It's")]).map(
      (item) => item.name,
    ),
  ).toEqual(["Ok Font"]);
});

it("커서가 있는 항목만 찾아 바꾸고 나머지 목록은 유지", () => {
  const text = "D2Coding, 'Fira Co', Consolas";
  expect(segmentAt(text, 15).query).toBe("Fira Co");
  expect(segmentAt(text, text.length).query).toBe("Consolas");
  expect(segmentAt("", 0).query).toBe("");
  expect(replaceSegment(text, 15, "Fira Code")).toEqual({
    text: "D2Coding, Fira Code, Consolas",
    caret: "D2Coding, Fira Code".length,
  });
  expect(replaceSegment("D2", 2, "D2Coding").text).toBe("D2Coding");
  expect(replaceSegment("Consolas, ", 10, "3270 Mono").text).toBe(
    "Consolas, '3270 Mono'",
  );
});

it("이름·다른 이름으로 찾고 앞부분이 맞는 글꼴을 먼저", () => {
  const families: FontFamily[] = [
    family("Cascadia Mono", [], true),
    family("JetBrains Mono", [], true),
    family("Malgun Gothic", ["맑은 고딕"]),
    family("Monaco", [], true),
  ];
  expect(suggestFonts(families, "mon").map((item) => item.name)).toEqual([
    "Monaco",
    "Cascadia Mono",
    "JetBrains Mono",
  ]);
  expect(suggestFonts(families, "맑은").map((item) => item.name)).toEqual([
    "Malgun Gothic",
  ]);
  expect(suggestFonts(families, " ")).toHaveLength(4);
});
