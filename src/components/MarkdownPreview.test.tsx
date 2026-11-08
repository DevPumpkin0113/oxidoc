import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MarkdownPreview from "./MarkdownPreview";
const content = "# Start\n\nParagraph\n\n## End\n\nLast paragraph";
function dimensions(article: HTMLElement, height = 2000) {
  Object.defineProperties(article, {
    scrollHeight: { configurable: true, value: height },
    clientHeight: { configurable: true, value: 500 },
  });
}
describe("미리보기 스크롤 동기화", () => {
  it("개요 위치 및 앵커 이동을 통지해 기존 하단 고정 해제", () => {
    const scroll = vi.fn();
    const text = content + "\n\n[Start](#start)";
    const { rerender } = render(
      <MarkdownPreview
        content={text}
        onScrollLine={scroll}
        syncTarget={{ source: "editor", line: 2, edge: "end", token: 1 }}
      />,
    );
    rerender(
      <MarkdownPreview
        content={text}
        onScrollLine={scroll}
        syncTarget={{ source: "editor", line: 2, edge: "end", token: 1 }}
        navigation={{ line: 5, token: 2 }}
      />,
    );
    expect(scroll).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole("link", { name: "Start" }));
    expect(scroll).toHaveBeenLastCalledWith(1);
  });
  it("편집기 하단 신호는 보이는 소스 줄과 무관하게 미리보기의 실제 끝으로 이동", () => {
    const { rerender } = render(<MarkdownPreview content={content} />);
    const article = screen.getByRole("article");
    dimensions(article);
    rerender(
      <MarkdownPreview
        content={content}
        syncTarget={{ source: "editor", line: 2, edge: "end", token: 1 }}
      />,
    );
    expect(article.scrollTop).toBe(1500);
    rerender(
      <MarkdownPreview
        content={content}
        syncTarget={{ source: "editor", line: 2, edge: "start", token: 2 }}
      />,
    );
    expect(article.scrollTop).toBe(0);
  });
  it("미리보기의 양 끝을 편집기에 전달, 중간은 소스 줄 동기화 유지", () => {
    const scroll = vi.fn();
    render(<MarkdownPreview content={content} onScrollLine={scroll} />);
    const article = screen.getByRole("article");
    dimensions(article);
    fireEvent.scroll(article);
    expect(scroll).toHaveBeenLastCalledWith(1, "start");
    article.scrollTop = 1500;
    fireEvent.scroll(article);
    expect(scroll).toHaveBeenLastCalledWith(7, "end");
    article.scrollTop = 750;
    fireEvent.scroll(article);
    expect(scroll.mock.calls[scroll.mock.calls.length - 1][1]).toBeUndefined();
  });
  it("이미지 등 늦은 높이 변경 시 하단 유지, 사용자 반대쪽 스크롤 시 관찰 해제", () => {
    let resized = () => {};
    const disconnected = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {
          disconnected();
        }
      },
    );
    try {
      const { rerender } = render(<MarkdownPreview content={content} />);
      const article = screen.getByRole("article");
      dimensions(article);
      rerender(
        <MarkdownPreview
          content={content}
          syncTarget={{ source: "editor", line: 2, edge: "end", token: 1 }}
        />,
      );
      dimensions(article, 2800);
      act(() => resized());
      expect(article.scrollTop).toBe(2300);
      rerender(
        <MarkdownPreview
          content={content}
          syncTarget={{ source: "preview", line: 3, token: 2 }}
        />,
      );
      expect(disconnected).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
