import { describe, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { themes } from "../settings/themes";
import {
  cachedHighlight,
  highlightCode,
  resolveLanguage,
  sanitizeHighlight,
} from "./codeHighlight";

const languages = [
  { id: "javascript", aliases: ["JavaScript", "js"], extensions: [".js"] },
  { id: "typescript", aliases: ["TypeScript", "ts"], extensions: [".ts"] },
  { id: "shell", aliases: ["Shell", "sh"], extensions: [".sh", ".bash"] },
];

function fakeMonaco() {
  const colorize = vi.fn(
    async (code: string) =>
      `<div class="monaco-tokenized-source"><span class="mtk6" onclick="x()">${code}</span><script>bad()</script></div>`,
  );
  const monaco = {
    languages: { getLanguages: () => languages },
    editor: { colorize, defineTheme: vi.fn(), setTheme: vi.fn() },
  } as unknown as typeof Monaco;
  return { monaco, colorize, load: () => Promise.resolve(monaco) };
}

describe("코드 블록 구문 강조", () => {
  it("펜스 언어 이름을 id·별칭·확장자로 대소문자 없이 찾음", () => {
    expect(resolveLanguage(languages, "JS")).toBe("javascript");
    expect(resolveLanguage(languages, "TypeScript")).toBe("typescript");
    expect(resolveLanguage(languages, "bash")).toBe("shell");
    expect(resolveLanguage(languages, "unknown")).toBeNull();
    expect(resolveLanguage(languages, " ")).toBeNull();
  });

  it("색 입힌 span과 줄 바꿈만 남기고 스크립트·이벤트 속성은 제거", () => {
    const html = sanitizeHighlight(
      '<div><span class="mtk1" style="x" onclick="y()">a</span><br><img src=x onerror=z()><script>w()</script></div>',
    );
    expect(html).toBe('<div><span class="mtk1">a</span><br></div>');
  });

  it("알려진 언어는 정제된 결과를 캐시하고, 모르는 언어·너무 큰 블록은 강조하지 않음", async () => {
    const { colorize, load } = fakeMonaco();
    const theme = themes[0];
    const html = await highlightCode("let a = 1", "js", theme, load);
    expect(html).toBe(
      '<div class="monaco-tokenized-source"><span class="mtk6">let a = 1</span></div>',
    );
    expect(cachedHighlight("let a = 1", "js", theme)).toBe(html);
    await highlightCode("let a = 1", "js", theme, load);
    expect(colorize).toHaveBeenCalledOnce();
    expect(colorize).toHaveBeenCalledWith("let a = 1", "javascript", {
      tabSize: 2,
    });

    expect(await highlightCode("x", "klingon", theme, load)).toBeNull();
    expect(
      await highlightCode("x".repeat(100_001), "js", theme, load),
    ).toBeNull();
    expect(
      await highlightCode("x", "js", theme, () => Promise.reject(Error("no"))),
    ).toBeNull();
  });
});
