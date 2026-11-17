import { expect, it } from "vitest";
import { countText } from "./textStats";

it("줄 바꿈을 뺀 글자 수(공백 포함)와 공백으로 나뉜 단어 수를 셈", () => {
  expect(countText("")).toEqual({ characters: 0, words: 0 });
  expect(countText("안녕 하세요\r\nhello  world")).toEqual({
    characters: 18,
    words: 4,
  });
  expect(countText("  앞뒤 공백\t탭 ")).toEqual({ characters: 10, words: 3 });
  // An emoji is one character even though it is two UTF-16 code units.
  expect(countText("😀 a")).toEqual({ characters: 3, words: 2 });
  expect(countText("전각　공백")).toEqual({ characters: 5, words: 2 });
});
