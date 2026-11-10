import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MermaidDiagram from "./MermaidDiagram";
import MarkdownPreview from "./MarkdownPreview";
import { renderDiagram } from "../workspace/mermaidRenderer";
vi.mock("../workspace/mermaidRenderer", () => ({ renderDiagram: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("Markdown mermaid 블록과 독립 파일 렌더링, 일반 코드는 유지", async () => {
  vi.mocked(renderDiagram).mockResolvedValue("data:image/svg+xml,test");
  const { rerender } = render(
    <MarkdownPreview
      content={"```mermaid\nflowchart LR\nA-->B\n```\n\n```text\nplain\n```"}
    />,
  );
  expect(
    await screen.findByRole("img", { name: "Mermaid 다이어그램" }),
  ).toBeInTheDocument();
  expect(screen.getByText("plain")).toBeInTheDocument();
  expect(renderDiagram).toHaveBeenCalledWith(
    "flowchart LR\nA-->B",
    expect.anything(),
    expect.any(Number),
    expect.any(Function),
  );
  rerender(
    <MarkdownPreview
      documentPath="flow.mmd"
      content={"sequenceDiagram\nA->>B: Hi"}
    />,
  );
  expect(
    screen.getByRole("article", { name: "Mermaid 미리보기" }),
  ).toBeInTheDocument();
  await screen.findByRole("img", { name: "Mermaid 다이어그램" });
  expect(renderDiagram).toHaveBeenLastCalledWith(
    "sequenceDiagram\nA->>B: Hi",
    expect.anything(),
    expect.any(Number),
    expect.any(Function),
  );
});
it("문법 오류 후 수정 복구 및 이전 렌더 응답 무시", async () => {
  let finish!: (image: string) => void;
  vi.mocked(renderDiagram).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<MermaidDiagram source="old" />);
  await vi.waitFor(() => expect(renderDiagram).toHaveBeenCalledOnce());
  vi.mocked(renderDiagram).mockRejectedValueOnce(Error("invalid syntax"));
  rerender(<MermaidDiagram source="invalid" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Mermaid 문법을 확인",
  );
  await act(async () => finish("old-image"));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  vi.mocked(renderDiagram).mockResolvedValueOnce("new-image");
  rerender(<MermaidDiagram source="valid" />);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "new-image");
});
