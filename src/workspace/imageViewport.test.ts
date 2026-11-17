import { expect, it } from "vitest";
import { clamped, fitted, steppedScale, zoomedAt } from "./imageViewport";

const frame = { width: 400, height: 300 };

it("맞춤은 큰 이미지만 줄이고 가운데 놓으며 작은 이미지는 100%", () => {
  expect(fitted({ width: 704, height: 252 }, frame)).toEqual({
    scale: 0.5,
    x: 24,
    y: 87,
  });
  expect(fitted({ width: 40, height: 20 }, frame)).toEqual({
    scale: 1,
    x: 180,
    y: 140,
  });
  expect(fitted({ width: 40, height: 20 }, { width: 0, height: 0 })).toEqual({
    scale: 1,
    x: 0,
    y: 0,
  });
});

it("커서 아래 지점을 고정한 채 확대·축소하고 단계 버튼은 다음 배율로", () => {
  const view = zoomedAt({ scale: 1, x: 100, y: 50 }, 2, 150, 100);
  // The image point under (150, 100) was (50, 50); it stays there at 2x.
  expect(view).toEqual({ scale: 2, x: 50, y: 0 });
  expect(zoomedAt(view, 100, 0, 0).scale).toBe(8);
  expect(zoomedAt(view, 0.001, 0, 0).scale).toBe(0.05);
  expect(steppedScale(0.37, 1)).toBe(0.5);
  expect(steppedScale(0.37, -1)).toBe(0.25);
  expect(steppedScale(8, 1)).toBe(8);
});

it("끌어도 이미지 가장자리 일부가 항상 화면 안에 남음", () => {
  const image = { width: 200, height: 100 };
  expect(clamped({ scale: 1, x: 1000, y: -1000 }, image, frame)).toEqual({
    scale: 1,
    x: 352,
    y: -52,
  });
  expect(clamped({ scale: 1, x: 10, y: 20 }, image, frame)).toEqual({
    scale: 1,
    x: 10,
    y: 20,
  });
});
