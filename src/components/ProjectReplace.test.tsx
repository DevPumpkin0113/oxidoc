import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ProjectReplace from "./ProjectReplace";
import { workspaceApi } from "../workspace/api";
import { useWorkspace } from "../workspace/store";
vi.mock("./ReplacementDiff", () => ({
  default: ({
    before,
    after,
    sideBySide,
  }: {
    before: string;
    after: string;
    sideBySide: boolean;
  }) => (
    <div
      data-testid="replacement-diff"
      data-split={sideBySide}
      data-replace-control
      tabIndex={0}
    >
      <span>{before}</span>
      <span>{after}</span>
    </div>
  ),
}));
afterEach(() => vi.restoreAllMocks());
it("전후 미리보기에서 선택 파일만 적용하고 미선택 파일 유지", async () => {
  const user = userEvent.setup();
  const files = [
    { path: "a.md", before: "old a", after: "new a", count: 1 },
    { path: "b.md", before: "old b", after: "new b", count: 1 },
  ];
  vi.spyOn(workspaceApi.advanced!, "previewReplace").mockResolvedValue({
    files,
    truncated: false,
    skipped: 0,
  });
  const apply = vi.fn().mockResolvedValue([{ path: "a.md", error: null }]);
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
      applyReplacements: apply,
    },
    true,
  );
  render(
    <ProjectReplace root="C:/notes" suspended={false} onClose={vi.fn()} />,
  );
  await user.type(screen.getByRole("textbox", { name: "검색어" }), "old");
  await user.type(screen.getByRole("textbox", { name: "대체어" }), "new");
  await user.click(screen.getByRole("button", { name: "변경 미리보기" }));
  expect(await screen.findByText("old a")).toBeInTheDocument();
  expect(screen.getByText("new a")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "b.md 선택" }));
  await user.click(screen.getByRole("button", { name: "선택 적용 (1)" }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith([files[0]]));
  expect(screen.getByRole("checkbox", { name: "b.md 선택" })).not.toBeChecked();
  expect(
    screen.queryByRole("checkbox", { name: "a.md 선택" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "b.md" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await screen.findByText("old b")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "통합 보기" }));
  await user.tab();
  await user.tab();
  const summary = screen.getByText("파일별 결과 보기").closest("summary")!;
  expect(summary).toHaveFocus();
  await user.click(summary);
  expect(summary.parentElement).toHaveAttribute("open");
});
it("전체/부분 선택·변경 건수 및 차이 보기 방식 전환", async () => {
  const user = userEvent.setup();
  vi.spyOn(workspaceApi.advanced!, "previewReplace").mockResolvedValue({
    files: [
      { path: "docs/a.md", before: "old a", after: "new a", count: 2 },
      { path: "notes/b.md", before: "old b", after: "new b", count: 3 },
    ],
    truncated: false,
    skipped: 0,
  });
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
    },
    true,
  );
  render(
    <ProjectReplace root="C:/notes" suspended={false} onClose={vi.fn()} />,
  );
  expect(screen.getByText("변경 내용을 먼저 확인하세요")).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "검색어" }), "old");
  await user.click(screen.getByRole("button", { name: "변경 미리보기" }));
  expect(
    await screen.findByText("선택 2개 파일 · 5곳 변경"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "notes/b.md 선택" }));
  expect(
    screen.getByRole("checkbox", { name: "전체 선택" }),
  ).toBePartiallyChecked();
  expect(screen.getByText("선택 1개 파일 · 2곳 변경")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "전체 선택" }));
  expect(
    screen.getByRole("checkbox", { name: "notes/b.md 선택" }),
  ).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "전체 선택" }));
  expect(screen.getByRole("button", { name: "선택 적용 (0)" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "통합 보기" }));
  expect(screen.getByTestId("replacement-diff")).toHaveAttribute(
    "data-split",
    "false",
  );
});
it("부분 실패 후 실패 원인·대상·선택 유지", async () => {
  const user = userEvent.setup();
  vi.spyOn(workspaceApi.advanced!, "previewReplace").mockResolvedValue({
    files: [{ path: "a.md", before: "old", after: "new", count: 1 }],
    truncated: false,
    skipped: 0,
  });
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
      applyReplacements: vi
        .fn()
        .mockResolvedValue([{ path: "a.md", error: "파일이 변경되었습니다." }]),
    },
    true,
  );
  render(
    <ProjectReplace root="C:/notes" suspended={false} onClose={vi.fn()} />,
  );
  await user.type(screen.getByRole("textbox", { name: "검색어" }), "old");
  await user.click(screen.getByRole("button", { name: "변경 미리보기" }));
  await user.click(
    await screen.findByRole("button", { name: "선택 적용 (1)" }),
  );
  expect(await screen.findByText("적용 0개 · 실패 1개")).toBeInTheDocument();
  expect(screen.getByText("파일이 변경되었습니다.")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "a.md 선택" })).toBeChecked();
  expect(screen.getByText("old")).toBeInTheDocument();
});
