import { createRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProjectSearch from "./ProjectSearch";
import { workspaceApi, type SearchResults } from "../workspace/api";
import { useWorkspace } from "../workspace/store";

const matches = [
  { path: "docs/a.md", name: "a.md", line: 1, column: 4, text: "a: needle" },
  { path: "docs/a.md", name: "a.md", line: 2, column: 1, text: "needle again" },
  { path: "b.md", name: "b.md", line: 3, column: 1, text: "needle here" },
];
beforeEach(() => {
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
    },
    true,
  );
});
afterEach(() => vi.restoreAllMocks());

it("파일별 결과·일치 강조·위치 이동·검색어 지우기", async () => {
  vi.spyOn(workspaceApi.advanced!, "search").mockResolvedValue({
    matches,
    truncated: false,
    skipped: 0,
  });
  const user = userEvent.setup();
  const onResult = vi.fn();
  const onReplace = vi.fn();
  const { container } = render(
    <ProjectSearch
      inputRef={createRef()}
      onResult={onResult}
      onReplace={onReplace}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "프로젝트 전체 바꾸기" }),
  );
  expect(onReplace).toHaveBeenCalledOnce();
  const input = screen.getByRole("textbox", { name: "프로젝트 전체 검색" });
  await user.type(input, "needle");
  expect(await screen.findByText("3개 결과")).toBeInTheDocument();
  expect(screen.getAllByText("a.md")).toHaveLength(1);
  expect(container.querySelectorAll("mark")).toHaveLength(3);
  await user.click(screen.getByTitle("docs/a.md:2:1"));
  expect(onResult).toHaveBeenCalledWith(matches[1]);
  await user.click(screen.getByRole("button", { name: "검색어 지우기" }));
  expect(input).toHaveFocus();
  expect(screen.queryByText("a.md")).not.toBeInTheDocument();
  expect(screen.getByText("검색어를 입력하세요.")).toBeInTheDocument();
});

it("새 조건 검색 중 이전 결과 숨김·폴더 범위 유지", async () => {
  let finish!: (value: SearchResults) => void;
  const search = vi
    .spyOn(workspaceApi.advanced!, "search")
    .mockResolvedValueOnce({ matches, truncated: false, skipped: 0 })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const user = userEvent.setup();
  const onClearFolder = vi.fn();
  render(
    <ProjectSearch
      inputRef={createRef()}
      onResult={vi.fn()}
      folder="docs"
      onClearFolder={onClearFolder}
    />,
  );
  await user.type(screen.getByRole("textbox"), "needle");
  await screen.findByText("a.md");
  await user.click(screen.getByRole("checkbox", { name: "대소문자 구분" }));
  expect(screen.queryByText("a.md")).not.toBeInTheDocument();
  expect(screen.getByText("검색 중…")).toBeInTheDocument();
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith("C:/notes", "needle", true, "docs"),
  );
  await act(async () => finish({ matches: [], truncated: false, skipped: 0 }));
  expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "전체 폴더에서 검색" }));
  expect(onClearFolder).toHaveBeenCalledOnce();
});

it("검색 오류와 빈 결과 안내 분리", async () => {
  vi.spyOn(workspaceApi.advanced!, "search").mockRejectedValue(
    new Error("search failed"),
  );
  const user = userEvent.setup();
  render(<ProjectSearch inputRef={createRef()} onResult={vi.fn()} />);
  await user.type(screen.getByRole("textbox"), "needle");
  expect(await screen.findByRole("alert")).toHaveTextContent("search failed");
  expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "검색어 지우기" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
