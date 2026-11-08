import { describe, expect, it } from "vitest";
import { scrollEdge } from "./scroll";
describe("동기화 스크롤 끝 위치", () => {
  it("시작·중간·끝 및 소수 픽셀 오차 판별", () => {
    expect(scrollEdge(0, 2400, 600)).toBe("start");
    expect(scrollEdge(800, 2400, 600)).toBeUndefined();
    expect(scrollEdge(1799.5, 2400, 600)).toBe("end");
    expect(scrollEdge(1800, 2400, 600)).toBe("end");
  });
  it("스크롤 없는 짧은 문서에서 하단으로 오판하지 않음", () => {
    expect(scrollEdge(0, 600, 600)).toBe("start");
    expect(scrollEdge(0, 300, 600)).toBe("start");
    expect(scrollEdge(2, 600, 600)).toBeUndefined();
  });
});
