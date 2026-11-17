import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import WorkbenchOverlays from "./WorkbenchOverlays";
import {
  workspaceApi,
  type Replacement,
  type ReplaceResult,
} from "../workspace/api";
import { useWorkspace, type Document } from "../workspace/store";
import { moveWithLinks } from "../workbench/linkUpdates";

vi.mock("./ReplacementDiff", () => ({
  default: ({ after }: { after: string }) => <pre>{after}</pre>,
}));

const files = [
  { path: "index.md", text: "[a](docs/a.md)" },
  { path: "readme.md", text: "[b](docs/a.md#top)" },
  { path: "other.md", text: "[c](c.md)" },
];
const open = (id: string, content: string, saved = content): Document => ({
  id,
  name: id,
  folder: "",
  content,
  savedContent: saved,
});

let apply: Mock<(updates: Replacement[]) => Promise<ReplaceResult[]>>;
beforeEach(() => {
  vi.spyOn(workspaceApi.advanced!, "markdownTexts").mockResolvedValue({
    files,
    truncated: false,
    skipped: 0,
  });
  apply = vi.fn(async (updates: Replacement[]) =>
    updates.map((update) => ({ path: update.path, error: null })),
  );
  useWorkspace.setState({
    desktop: true,
    project: { name: "Notes", path: "C:/notes" },
    documents: [],
    applyReplacements: apply,
  });
});
afterEach(() => vi.restoreAllMocks());

const move = { from: "docs", to: "archive/docs" };

it("고칠 링크가 없으면 묻지 않고 바로 이동", async () => {
  const perform = vi.fn().mockResolvedValue(true);
  render(<WorkbenchOverlays />);
  await expect(
    moveWithLinks({ from: "nothing", to: "x/nothing" }, perform),
  ).resolves.toBe(true);
  expect(perform).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("선택한 파일만 이동 뒤 새 경로로 고치고, 저장 안 된 열린 문서는 제외", async () => {
  useWorkspace.setState({
    documents: [open("readme.md", "[b](docs/a.md#top) edited", files[1].text)],
  });
  const perform = vi.fn().mockResolvedValue(true);
  const user = userEvent.setup();
  render(<WorkbenchOverlays />);
  let moved: Promise<boolean>;
  act(() => {
    moved = moveWithLinks(move, perform);
  });
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Markdown 파일 2개의 링크 2개",
  );
  expect(
    screen.getByRole("checkbox", { name: "readme.md 선택" }),
  ).toBeDisabled();
  expect(
    screen.getByText("저장하지 않은 변경이 있는 열린 문서"),
  ).toBeInTheDocument();
  expect(await screen.findByText("[a](archive/docs/a.md)")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "이동하고 링크 1개 고치기" }),
  );
  await expect(moved!).resolves.toBe(true);
  expect(perform).toHaveBeenCalledOnce();
  expect(apply).toHaveBeenCalledWith([
    {
      path: "index.md",
      before: "[a](docs/a.md)",
      after: "[a](archive/docs/a.md)",
      count: 1,
    },
  ]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("이동만·취소·이동 실패·갱신 실패 처리", async () => {
  const user = userEvent.setup();
  render(<WorkbenchOverlays />);
  const ask = async (perform: () => Promise<boolean>) => {
    let moved!: Promise<boolean>;
    act(() => {
      moved = moveWithLinks(move, perform);
    });
    await screen.findByRole("dialog");
    // Wrapped: returning the promise itself would wait for the move.
    return { moved };
  };

  const cancelled = vi.fn();
  let { moved: result } = await ask(cancelled);
  await user.click(screen.getByRole("button", { name: "취소" }));
  await expect(result).resolves.toBe(false);
  expect(cancelled).not.toHaveBeenCalled();

  const moveOnly = vi.fn().mockResolvedValue(true);
  ({ moved: result } = await ask(moveOnly));
  await user.click(screen.getByRole("button", { name: "이동만" }));
  await expect(result).resolves.toBe(true);
  expect(apply).not.toHaveBeenCalled();

  ({ moved: result } = await ask(vi.fn().mockResolvedValue(false)));
  await user.click(
    screen.getByRole("button", { name: "이동하고 링크 2개 고치기" }),
  );
  await expect(result).resolves.toBe(false);
  expect(apply).not.toHaveBeenCalled();

  apply.mockResolvedValueOnce([
    { path: "index.md", error: null },
    { path: "readme.md", error: "미리보기 이후 파일이 변경되었습니다." },
  ]);
  ({ moved: result } = await ask(vi.fn().mockResolvedValue(true)));
  await user.click(
    screen.getByRole("button", { name: "이동하고 링크 2개 고치기" }),
  );
  expect(
    await screen.findByText("이동했지만 일부 링크를 고치지 못했습니다"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("미리보기 이후 파일이 변경되었습니다."),
  ).toBeInTheDocument();
  expect(screen.queryByText("index.md")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "닫기" }));
  await expect(result).resolves.toBe(true);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
