import { createRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProjectSearch from "./ProjectSearch";
import { workspaceApi, type SearchResults } from "../workspace/api";
import { useWorkspace } from "../workspace/store";
import { defaultSearchOptions } from "../workspace/searchOptions";

const matches = [
  {
    path: "docs/a.md",
    name: "a.md",
    line: 1,
    column: 4,
    length: 6,
    text: "a: needle",
  },
  {
    path: "docs/a.md",
    name: "a.md",
    line: 2,
    column: 1,
    length: 6,
    text: "needle again",
  },
  {
    path: "b.md",
    name: "b.md",
    line: 3,
    column: 1,
    length: 6,
    text: "needle here",
  },
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
  await user.click(screen.getByRole("button", { name: "대소문자 구분" }));
  expect(screen.queryByText("a.md")).not.toBeInTheDocument();
  expect(screen.getByText("검색 중…")).toBeInTheDocument();
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      "C:/notes",
      "needle",
      { ...defaultSearchOptions, caseSensitive: true },
      "docs",
    ),
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

it("정규식·단어 단위·파일 조건을 검색에 전달하고 조건과 일치 길이를 표시, 새로고침은 같은 조건으로 재검색", async () => {
  const search = vi.spyOn(workspaceApi.advanced!, "search").mockResolvedValue({
    matches: [
      {
        path: "a.md",
        name: "a.md",
        line: 1,
        column: 3,
        length: 6,
        text: "x item-42 y",
      },
    ],
    truncated: false,
    skipped: 0,
  });
  const user = userEvent.setup();
  const { container } = render(
    <ProjectSearch inputRef={createRef()} onResult={vi.fn()} />,
  );
  const input = screen.getByRole("textbox", { name: "프로젝트 전체 검색" });
  await user.type(input, "item-\\d+");
  await user.click(screen.getByRole("button", { name: "정규식 사용" }));
  await user.click(input);
  await user.keyboard("{Alt>}w{/Alt}");
  expect(screen.getByRole("button", { name: "단어 단위" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const filter = screen.getByRole("button", { name: "파일 조건" });
  await user.click(filter);
  expect(filter).toHaveAttribute("aria-expanded", "true");
  await user.type(screen.getByLabelText("포함할 파일"), "*.md");
  await user.type(screen.getByLabelText("제외할 파일"), "drafts");
  const options = {
    caseSensitive: false,
    regex: true,
    wholeWord: true,
    include: "*.md",
    exclude: "drafts",
  };
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      "C:/notes",
      "item-\\d+",
      options,
      "",
    ),
  );
  expect(container.querySelector("mark")).toHaveTextContent("item-4");
  expect(screen.getByLabelText("검색 조건")).toHaveTextContent(
    "단어 단위 · 정규식 · 포함: *.md · 제외: drafts",
  );
  const calls = search.mock.calls.length;
  await user.click(screen.getByRole("button", { name: "결과 새로고침" }));
  await waitFor(() => expect(search).toHaveBeenCalledTimes(calls + 1));
  expect(search).toHaveBeenLastCalledWith("C:/notes", "item-\\d+", options, "");
});

it("브라우저 미리보기 검색도 정규식·파일 조건을 따르고 잘못된 정규식을 안내", async () => {
  useWorkspace.setState({ desktop: false });
  const user = userEvent.setup();
  render(<ProjectSearch inputRef={createRef()} onResult={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "정규식 사용" }));
  await user.type(
    screen.getByRole("textbox", { name: "프로젝트 전체 검색" }),
    "(",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("잘못된 정규식");
});

it("사이드바 보기를 바꿨다 돌아와도 검색어·조건·결과 유지, 입력란은 자동 완성 끔", async () => {
  const search = vi.spyOn(workspaceApi.advanced!, "search").mockResolvedValue({
    matches,
    truncated: false,
    skipped: 0,
  });
  const user = userEvent.setup();
  const first = render(
    <ProjectSearch inputRef={createRef()} onResult={vi.fn()} />,
  );
  await user.type(screen.getByRole("textbox"), "needle");
  await user.click(screen.getByRole("button", { name: "정규식 사용" }));
  await user.click(screen.getByRole("button", { name: "파일 조건" }));
  await screen.findByText("3개 결과");
  first.unmount();
  const calls = search.mock.calls.length;

  render(<ProjectSearch inputRef={createRef()} onResult={vi.fn()} />);
  expect(
    screen.getByRole("textbox", { name: "프로젝트 전체 검색" }),
  ).toHaveValue("needle");
  expect(screen.getByRole("button", { name: "정규식 사용" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("3개 결과")).toBeInTheDocument();
  expect(search).toHaveBeenCalledTimes(calls);
  for (const input of screen.getAllByRole("textbox"))
    expect(input).toHaveAttribute("autocomplete", "off");
});
