import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrollArea from "./ScrollArea";

function size(element: HTMLElement, total: number, visible: number) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: total },
    clientHeight: { configurable: true, value: visible },
    scrollWidth: { configurable: true, value: total },
    clientWidth: { configurable: true, value: visible },
  });
}

const thumbOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-hidden="true"] > div');

describe("오버레이 스크롤 영역", () => {
  it("뷰포트에 호출자 요소·속성을 그대로 쓰고 넘칠 때만 막대를 그림", () => {
    const ref = createRef<HTMLElement>();
    const onScroll = vi.fn();
    const { container } = render(
      <ScrollArea
        as="article"
        aria-label="본문"
        viewportClassName="content"
        viewportRef={ref}
        onScroll={onScroll}
      >
        <p>내용</p>
      </ScrollArea>,
    );
    const viewport = screen.getByRole("article", { name: "본문" });
    expect(ref.current).toBe(viewport);
    expect(viewport.className).toContain("content");
    expect(viewport.firstElementChild?.tagName).toBe("P");
    expect(thumbOf(container)).toBeNull();

    size(viewport, 1000, 250);
    viewport.scrollTop = 375;
    fireEvent.scroll(viewport);
    expect(onScroll).toHaveBeenCalledOnce();
    const thumb = thumbOf(container)!;
    // 250 / 1000 of the track, positioned at the halfway point.
    expect(thumb.style.height).toBe("62.5px");
    expect(thumb.style.top).toBe("93.75px");
  });

  it("빈 트랙 클릭은 한 화면씩, 가로 영역은 가로 막대만 그림", () => {
    const { container } = render(
      <ScrollArea axis="x" viewportClassName="row">
        <span>탭</span>
      </ScrollArea>,
    );
    const viewport = container.querySelector<HTMLElement>(".row")!;
    viewport.scrollBy = vi.fn();
    size(viewport, 800, 200);
    fireEvent.scroll(viewport);
    const track = container.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(track.className).toContain("trackX");
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
    } as DOMRect);
    fireEvent.mouseDown(track, { clientX: 150 });
    expect(viewport.scrollBy).toHaveBeenCalledWith({ left: 200 });
  });
});
