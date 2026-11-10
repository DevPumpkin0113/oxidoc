import { expect, it, vi } from "vitest";
import { renderDiagram } from "./mermaidRenderer";
import { themes } from "../settings/themes";
const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: engine }));
it("SVG 정제·외부 링크/HTML 제거·엄격 설정 및 이미지 격리", async () => {
  engine.render.mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><script>alert(1)</script><foreignObject><div>HTML</div></foreignObject><image href="https://example.com/track.png"/><a href="javascript:alert(1)"><text>Test</text></a><path id="a"/><use href="#a"/></svg>',
  });
  const result = await renderDiagram(
    "flowchart LR; A-->B",
    themes[0],
    15,
    () => true,
  );
  const svg = decodeURIComponent(result!.split(",").slice(1).join(","));
  expect(svg).not.toMatch(
    /<script|foreignObject|javascript:|https:\/\/example.com/,
  );
  expect(svg).not.toContain("href=");
  expect(svg).toContain('width="200"');
  expect(engine.initialize).toHaveBeenLastCalledWith(
    expect.objectContaining({
      securityLevel: "strict",
      htmlLabels: false,
      maxEdges: 500,
    }),
  );
  expect(document.querySelector('[id^="oxidoc-mermaid-"]')).toBeNull();
});
it("중단된/너무 큰 렌더 요청 차단", async () => {
  const calls = engine.render.mock.calls.length;
  expect(
    await renderDiagram("flowchart LR", themes[0], 15, () => false),
  ).toBeUndefined();
  await expect(
    renderDiagram("a".repeat(50001), themes[0], 15, () => true),
  ).rejects.toThrow("50,000");
  expect(engine.render.mock.calls.length).toBe(calls);
});
