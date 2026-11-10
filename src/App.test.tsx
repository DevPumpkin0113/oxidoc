import {
  render,
  screen,
  within,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useWorkspace } from "./workspace/store";
import { useSettings } from "./settings/store";
import packageInfo from "../package.json";
import { useUpdater } from "./settings/updater";

const nativeWindow = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
  onCloseRequested: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => nativeWindow,
}));
vi.mock("./components/MarkdownEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Markdown 편집기"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

beforeEach(() => {
  useUpdater.setState(useUpdater.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(<T,>(command: string) =>
    Promise.resolve(
      (command === "list_projects"
        ? []
        : command === "load_workspace_state" || command === "load_session"
          ? {}
          : undefined) as T,
    ),
  );
  vi.mocked(isTauri).mockReturnValue(false);
  nativeWindow.isMaximized.mockResolvedValue(false);
  nativeWindow.onResized.mockResolvedValue(vi.fn());
  nativeWindow.onCloseRequested.mockResolvedValue(vi.fn());
  nativeWindow.destroy.mockResolvedValue(undefined);
  nativeWindow.minimize.mockResolvedValue(undefined);
  nativeWindow.toggleMaximize.mockResolvedValue(undefined);
  nativeWindow.close.mockResolvedValue(undefined);
});

it("Ctrl P 파일 검색·키보드 열기에서 기존 탭 재사용", async () => {
  const user = userEvent.setup();
  render(<App />);
  const target = useWorkspace.getState().documents[1];
  fireEvent.keyDown(window, { key: "p", ctrlKey: true });
  const input = await screen.findByRole("combobox", {
    name: "파일명 또는 경로 검색",
  });
  await user.type(input, target.name);
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(useWorkspace.getState().activeId).toBe(target.id);
  expect(useWorkspace.getState().documents).toHaveLength(2);
});

it("외부 변경 자동 반영 및 미저장 편집 유지 선택", async () => {
  const user = userEvent.setup();
  render(<App />);
  const id = useWorkspace.getState().activeId!;
  act(() => useWorkspace.getState().noticeExternal(id, "external original"));
  expect(
    screen.queryByRole("button", { name: "다시 읽기" }),
  ).not.toBeInTheDocument();
  expect(
    useWorkspace.getState().documents.find((document) => document.id === id)
      ?.content,
  ).toBe("external original");
  act(() => {
    useWorkspace.getState().edit(id, "my local edit");
    useWorkspace.getState().noticeExternal(id, "external next");
  });
  await user.click(screen.getByRole("button", { name: "다시 읽기" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "취소",
    }),
  );
  await user.click(screen.getByRole("button", { name: "내 편집 유지" }));
  expect(
    useWorkspace.getState().documents.find((document) => document.id === id),
  ).toMatchObject({
    content: "my local edit",
    savedContent: "external next",
    diskContent: undefined,
  });
});

it("업데이트 설치 확인·미저장 취소·설정 저장 실패 시 설치 중단 및 버퍼 유지", async () => {
  const user = userEvent.setup();
  vi.mocked(isTauri).mockReturnValue(true);
  useWorkspace.setState({
    initialized: true,
    desktop: true,
    project: { name: "Notes", path: "C:/notes" },
    documents: [
      {
        id: "a.md",
        name: "a.md",
        folder: "",
        content: "unsaved",
        savedContent: "before",
      },
    ],
    activeId: "a.md",
    recoveryReady: true,
  });
  const installer = vi.fn();
  useUpdater.setState({
    phase: "ready",
    version: "0.3.0",
    install: async (prepare) => {
      try {
        if (await prepare()) installer();
      } catch (error) {
        useUpdater.setState({ error: String(error) });
      }
    },
  });
  const flush = vi
    .spyOn(useSettings.getState(), "flush")
    .mockRejectedValue(Error("settings write failed"));
  render(<App />);
  await user.click(screen.getByRole("button", { name: "설정" }));
  await user.click(screen.getByRole("button", { name: "설치 및 재시작" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "취소",
    }),
  );
  expect(installer).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "설치 및 재시작" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "계속",
    }),
  );
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "취소",
    }),
  );
  expect(installer).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "설치 및 재시작" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "계속",
    }),
  );
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "저장 안 함",
    }),
  );
  await waitFor(() =>
    expect(useUpdater.getState().error).toContain("settings write failed"),
  );
  expect(installer).not.toHaveBeenCalled();
  expect(useWorkspace.getState().busy).toBe(false);
  expect(useWorkspace.getState().documents[0].content).toBe("unsaved");
  flush.mockRestore();
});

it("닫은 탭 단축키 복원 및 문서 위치의 상위 폴더 펼침", async () => {
  const user = userEvent.setup();
  render(<App />);
  const document = useWorkspace.getState().documents[1];
  await user.click(
    screen.getByRole("button", { name: `${document.name} 탭 닫기` }),
  );
  expect(useWorkspace.getState().documents).toHaveLength(1);
  fireEvent.keyDown(window, { key: "T", ctrlKey: true, shiftKey: true });
  await waitFor(() =>
    expect(useWorkspace.getState().documents).toHaveLength(2),
  );
  fireEvent.contextMenu(screen.getByRole("tab", { name: document.name }), {
    clientX: 100,
    clientY: 30,
  });
  await user.click(
    screen.getByRole("menuitem", { name: "탐색기에서 위치 표시" }),
  );
  const folder = within(screen.getByRole("complementary"))
    .getByText(document.folder)
    .closest("details")!;
  await waitFor(() => expect(folder).toHaveAttribute("open"));
  expect(screen.getByRole("button", { name: document.name })).toHaveFocus();
});

it("다른 탭 닫기 취소 시 전체 유지, 저장 안 함 선택 시 대상만 닫기", async () => {
  const user = userEvent.setup();
  render(<App />);
  const initial = useWorkspace.getState().documents;
  act(() => useWorkspace.getState().edit(initial[1].id, "unsaved other"));
  const tab = screen.getByRole("tab", { name: initial[0].name });
  fireEvent.contextMenu(tab, { clientX: 200, clientY: 30 });
  await user.click(screen.getByRole("menuitem", { name: "다른 탭 닫기" }));
  await user.click(await screen.findByRole("button", { name: "취소" }));
  expect(useWorkspace.getState().documents).toHaveLength(2);
  fireEvent.contextMenu(tab, { clientX: 200, clientY: 30 });
  await user.click(screen.getByRole("menuitem", { name: "다른 탭 닫기" }));
  await user.click(await screen.findByRole("button", { name: "저장 안 함" }));
  expect(
    useWorkspace.getState().documents.map((document) => document.id),
  ).toEqual([initial[0].id]);
});

it("일괄 닫기 저장 중 실패 시 문서를 닫지 않고 버퍼 보존", async () => {
  const user = userEvent.setup();
  render(<App />);
  const documents = useWorkspace.getState().documents;
  const save = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  act(() => {
    documents.forEach((document) =>
      useWorkspace.getState().edit(document.id, "unsaved"),
    );
    useWorkspace.setState({ save });
  });
  fireEvent.contextMenu(screen.getByRole("tab", { name: documents[0].name }), {
    clientX: 100,
    clientY: 30,
  });
  await user.click(screen.getByRole("menuitem", { name: "모든 탭 닫기" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "저장",
    }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(useWorkspace.getState().documents).toHaveLength(2);
  expect(useWorkspace.getState().documents[1].content).toBe("unsaved");
});

it("탐색기 복사 단축키·폴더 붙여넣기, 입력란 텍스트 단축키 분리", async () => {
  const user = userEvent.setup();
  vi.mocked(isTauri).mockReturnValue(true);
  const file = { name: "a.md", path: "a.md", isDirectory: false };
  const folder = { name: "docs", path: "docs", isDirectory: true };
  useWorkspace.setState({
    initialized: true,
    desktop: true,
    project: { name: "Notes", path: "C:/notes" },
    tree: { "": [file, folder], docs: [] },
  });
  vi.mocked(invoke).mockImplementation(<T,>(command: string, args?: unknown) =>
    Promise.resolve(
      (command === "transfer_entry"
        ? { ...file, path: "docs/a.md" }
        : command === "list_entries"
          ? (args as { path: string }).path === ""
            ? [file, folder]
            : []
          : undefined) as T,
    ),
  );
  render(<App />);
  await user.click(screen.getByRole("button", { name: "전체 보기" }));
  const source = screen.getByRole("button", { name: "a.md" });
  source.focus();
  fireEvent.keyDown(source, { key: "c", ctrlKey: true });
  expect(useWorkspace.getState().clipboard).toMatchObject({
    entry: file,
    cut: false,
  });
  fireEvent.contextMenu(screen.getByText("docs"), {
    clientX: 30,
    clientY: 150,
  });
  await user.click(screen.getByRole("menuitem", { name: /붙여넣기/ }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("transfer_entry", {
      root: "C:/notes",
      path: "a.md",
      parent: "docs",
      cut: false,
      name: null,
    }),
  );
  expect(useWorkspace.getState().clipboard?.cut).toBe(false);
  await user.click(screen.getByRole("button", { name: "검색" }));
  const query = screen.getByRole("textbox", { name: "프로젝트 전체 검색" });
  const previous = useWorkspace.getState().clipboard;
  fireEvent.keyDown(query, { key: "x", ctrlKey: true });
  expect(useWorkspace.getState().clipboard).toBe(previous);
});

it("Monaco 찾기 입력 우클릭 붙여넣기는 본문 대신 검색어만 변경", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("main");
  const host = document.createElement("div");
  host.className = "monaco-editor";
  const input = document.createElement("input");
  input.value = "query";
  input.setAttribute("aria-label", "찾기 위젯 검색어");
  host.append(input);
  screen.getByRole("main").append(host);
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: vi.fn().mockResolvedValue("replacement") },
  });
  try {
    input.focus();
    input.setSelectionRange(0, 5);
    const documents = useWorkspace.getState().documents;
    fireEvent.contextMenu(input, { clientX: 100, clientY: 100 });
    await user.click(screen.getByRole("menuitem", { name: "붙여넣기" }));
    await waitFor(() => expect(input.value).toBe("replacement"));
    expect(useWorkspace.getState().documents).toBe(documents);
  } finally {
    host.remove();
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("작업 공간 UI", () => {
  it("폴더 우클릭 검색 범위 전달 및 전체 검색으로 범위 해제", async () => {
    const user = userEvent.setup();
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation(<T,>(name: string) =>
      Promise.resolve(
        (name === "search_project"
          ? { matches: [], truncated: false, skipped: 0 }
          : undefined) as T,
      ),
    );
    useWorkspace.setState({
      initialized: true,
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
      projects: [{ name: "Notes", path: "C:/notes" }],
      tree: { "": [{ name: "docs", path: "docs", isDirectory: true }] },
    });
    render(<App />);
    fireEvent.contextMenu(screen.getByText("docs"), {
      clientX: 30,
      clientY: 150,
    });
    await user.click(
      screen.getByRole("menuitem", { name: "이 폴더에서 검색" }),
    );
    const query = screen.getByRole("textbox", { name: "프로젝트 전체 검색" });
    await user.type(query, "needle");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("search_project", {
        root: "C:/notes",
        query: "needle",
        caseSensitive: false,
        folder: "docs",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "전체 폴더에서 검색" }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("search_project", {
        root: "C:/notes",
        query: "needle",
        caseSensitive: false,
        folder: "",
      }),
    );
  });
  it("파일·빈 공간 우클릭의 앱 메뉴와 탐색기 명령 대상 연결", async () => {
    const user = userEvent.setup();
    vi.mocked(isTauri).mockReturnValue(true);
    useWorkspace.setState({
      initialized: true,
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
      projects: [{ name: "Notes", path: "C:/notes" }],
      tree: {
        "": [
          { name: "a.md", path: "a.md", isDirectory: false },
          { name: "folder", path: "folder", isDirectory: true },
        ],
        folder: [
          { name: "inside.md", path: "folder/inside.md", isDirectory: false },
        ],
      },
    });
    render(<App />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "a.md" }), {
      clientX: 40,
      clientY: 80,
    });
    await user.click(screen.getByRole("menuitem", { name: "탐색기에서 열기" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_in_explorer", {
        root: "C:/notes",
        path: "a.md",
      }),
    );
    const aside = screen.getByRole("complementary", { name: "탐색기" });
    const folder = within(aside)
      .getByText("folder")
      .closest("summary")!.parentElement!;
    await user.click(within(aside).getByText("folder"));
    expect(folder).toHaveAttribute("open");
    expect(fireEvent.contextMenu(aside, { clientX: 35, clientY: 600 })).toBe(
      false,
    );
    expect(
      screen.getByRole("menuitem", { name: "새 문서" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "모두 접기" }));
    expect(folder).not.toHaveAttribute("open");
    expect(aside.querySelector("details")).toHaveAttribute("open");
  });
  it("프로젝트 행 우클릭의 열기·표시 이름·즐겨찾기 메뉴", async () => {
    const user = userEvent.setup();
    const project = { name: "Notes", path: "C:/notes", favorite: false };
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation(<T,>(name: string) =>
      Promise.resolve(
        (name === "update_project"
          ? [{ ...project, favorite: true }]
          : undefined) as T,
      ),
    );
    useWorkspace.setState({
      initialized: true,
      desktop: true,
      project,
      projects: [project],
      tree: { "": [] },
    });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "프로젝트" }));
    const card = screen
      .getAllByRole("button")
      .find(
        (button) => button.querySelector("strong")?.textContent === "Notes",
      )!;
    fireEvent.contextMenu(card, { clientX: 80, clientY: 300 });
    expect(
      screen.getByRole("menuitem", { name: "프로젝트 열기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "표시 이름 변경" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "즐겨찾기에 추가" }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_project", {
        path: project.path,
        patch: { favorite: true },
      }),
    );
  });
  it("입력란 우클릭 텍스트 메뉴와 팔레트 위 메뉴의 Esc 계층 유지", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("textbox", { name: "Markdown 편집기" });
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "abc");
    input.setSelectionRange(0, 3);
    expect(fireEvent.contextMenu(input, { clientX: 200, clientY: 150 })).toBe(
      false,
    );
    expect(screen.getByRole("menuitem", { name: "복사" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      fireEvent.contextMenu(screen.getByRole("main"), {
        clientX: 600,
        clientY: 500,
      }),
    ).toBe(false);
    expect(screen.getByRole("menuitem", { name: "설정" })).toBeInTheDocument();
  });
  it("우클릭 대상 이름 변경·휴지통 확인과 다른 활성 문서의 미저장 버퍼 보존", async () => {
    const user = userEvent.setup(),
      renameEntry = vi.fn().mockResolvedValue(undefined),
      trashEntry = vi.fn().mockResolvedValue(undefined);
    const entry = { name: "a.md", path: "a.md", isDirectory: false };
    const other = { name: "b.md", path: "b.md", isDirectory: false };
    vi.mocked(isTauri).mockReturnValue(true);
    useWorkspace.setState({
      initialized: true,
      desktop: true,
      projects: [{ name: "Notes", path: "C:/notes" }],
      project: { name: "Notes", path: "C:/notes" },
      tree: { "": [entry, other] },
      documents: [
        {
          id: "a.md",
          name: "a.md",
          folder: "",
          content: "a",
          savedContent: "a",
        },
        {
          id: "b.md",
          name: "b.md",
          folder: "",
          content: "dirty b",
          savedContent: "b",
        },
      ],
      activeId: "b.md",
      renameEntry,
      trashEntry,
    });
    render(<App />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "a.md" }), {
      clientX: 40,
      clientY: 80,
    });
    await user.click(screen.getByRole("menuitem", { name: "이름 변경" }));
    const rename = screen.getByRole("dialog");
    await user.clear(within(rename).getByRole("textbox"));
    await user.type(within(rename).getByRole("textbox"), "renamed.md");
    await user.click(within(rename).getByRole("button", { name: "확인" }));
    await waitFor(() =>
      expect(renameEntry).toHaveBeenCalledWith("a.md", "renamed.md"),
    );
    expect(useWorkspace.getState().activeId).toBe("b.md");
    fireEvent.contextMenu(screen.getByRole("button", { name: "a.md" }), {
      clientX: 40,
      clientY: 80,
    });
    await user.click(screen.getByRole("menuitem", { name: "휴지통으로 이동" }));
    const trash = screen.getByRole("dialog");
    expect(within(trash).getByText("a.md")).toBeInTheDocument();
    await user.click(within(trash).getByRole("button", { name: "취소" }));
    expect(trashEntry).not.toHaveBeenCalled();
    expect(useWorkspace.getState().documents[1].content).toBe("dirty b");
  });
  it("플로팅 개요의 제목 이동·닫기·Esc 및 호출 버튼 포커스 복원", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = await screen.findByRole("textbox", {
      name: "Markdown 편집기",
    });
    const content = (editor as HTMLTextAreaElement).value;
    const toggle = screen.getByRole("button", { name: "문서 개요" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("complementary", { name: "문서 개요" });
    await user.click(
      within(panel).getByRole("button", { name: "작은 기록에서 시작하기" }),
    );
    expect(editor).toHaveValue(content);
    await user.click(
      within(panel).getByRole("button", { name: "문서 개요 닫기" }),
    );
    expect(
      screen.queryByRole("complementary", { name: "문서 개요" }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });
  it("프로젝트가 열려 있고 문서가 없으면 폴더 열기 대신 문서 작업 안내와 실제 폴더명 표시", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    render(<App />);
    await waitFor(() => expect(useWorkspace.getState().initialized).toBe(true));
    act(() =>
      useWorkspace.setState({
        project: {
          name: "사용자 지정 이름",
          path: "C:\\notes\\project-folder\\",
        },
        documents: [],
        activeId: null,
        tree: { "": [] },
        busy: false,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "열린 문서 없음" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /폴더 열기/ }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("button", { name: "새 문서" }),
    ).toBeInTheDocument();
    expect(screen.getByText("project-folder")).toHaveAttribute(
      "title",
      "C:\\notes\\project-folder\\",
    );
    expect(screen.queryByText("WORKSPACE")).not.toBeInTheDocument();
    const root = screen
      .getByText("project-folder")
      .closest("[data-tree-path]")!.parentElement!;
    const user = userEvent.setup();
    await user.click(within(root).getByRole("button", { name: "새 문서" }));
    expect(root).not.toHaveAttribute("open");
    expect(
      screen.getByRole("textbox", { name: "새 문서 이름" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "취소" }));
  });
  it("프로젝트가 없을 때만 폴더 열기 안내 제공", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    render(<App />);
    await waitFor(() => expect(useWorkspace.getState().initialized).toBe(true));
    expect(
      screen.getByRole("button", { name: /^폴더 열기/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("button", {
        name: "프로젝트 폴더 열기",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("문서 검색")).not.toBeInTheDocument();
  });
  it("설정 탭 언어·테마·글꼴 변경 및 문서 내용 보존, 업데이트 비활성 UI", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = await screen.findByRole("textbox", {
      name: "Markdown 편집기",
    });
    await user.type(editor, "\n설정 변경 전 내용");
    const content = (editor as HTMLTextAreaElement).value;
    await user.click(screen.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("tab", { name: "설정" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "업데이트 확인" }),
    ).toBeDisabled();
    expect(
      screen.getByText("업데이트는 데스크톱 앱에서 사용할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText(`v${packageInfo.version}`)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("색상 모드"), "dark");
    await user.click(screen.getByRole("button", { name: "Dracula" }));
    expect(document.documentElement.dataset.theme).toBe("dracula");
    await user.selectOptions(screen.getByLabelText("표시 언어"), "en");
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Explorer" }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Display language"), "ko");
    await user.click(screen.getByRole("button", { name: "설정 탭 닫기" }));
    expect(
      await screen.findByRole("textbox", { name: "Markdown 편집기" }),
    ).toHaveValue(content);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some((call) => /update|install|download/.test(call[0])),
    ).toBe(false);
  });
  it("시스템 테마 이벤트 즉시 적용 및 설정 단축키", async () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", () => media);
    try {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole("textbox", { name: "Markdown 편집기" });
      await user.keyboard("{Control>},{/Control}");
      expect(screen.getByRole("heading", { name: "설정" })).toBeInTheDocument();
      act(() => {
        media.matches = true;
        media.dispatchEvent(new Event("change"));
      });
      expect(document.documentElement.dataset.theme).toBe("dark-modern");
      act(() => {
        media.matches = false;
        media.dispatchEvent(new Event("change"));
      });
      expect(document.documentElement.dataset.theme).toBe("light-modern");
      await act(async () => {
        await useSettings
          .getState()
          .update({ mode: "dark", uiFontSize: 18, previewFontSize: 24 });
      });
      expect(
        document.documentElement.style.getPropertyValue("--ui-font-size"),
      ).toBe("18px");
      expect(
        document.documentElement.style.getPropertyValue("--preview-font-size"),
      ).toBe("24px");
      act(() => {
        media.dispatchEvent(new Event("change"));
      });
      expect(document.documentElement.dataset.theme).toBe("dark-modern");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("프로젝트 선택부터 실제 파일 명령 읽기·편집·저장 연결", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const project = { name: "Notes", path: "C:/notes" };
    const entry = { name: "note.md", path: "note.md", isDirectory: false };
    let picked = false;
    vi.mocked(invoke).mockImplementation(<T,>(command: string) => {
      let value: unknown;
      if (command === "pick_project") {
        picked = true;
        value = project;
      } else if (command === "list_projects") value = picked ? [project] : [];
      else if (command === "list_entries") value = [entry];
      else if (command === "read_document") value = "# Before";
      else if (command === "update_project") value = [project];
      else if (command === "load_workspace_state" || command === "load_session")
        value = {};
      return Promise.resolve(value as T);
    });
    const user = userEvent.setup();
    render(<App />);
    const folderButton = screen.getByRole("button", { name: /^폴더 열기/ });
    await waitFor(() => expect(folderButton).toBeEnabled());
    await user.click(folderButton);
    await user.click(await screen.findByRole("button", { name: "note.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Markdown 편집기",
    });
    await user.clear(editor);
    await user.type(editor, "# Saved");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_document", {
        root: project.path,
        path: entry.path,
        content: "# Saved",
        expected: "# Before",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "저장" })).toBeDisabled(),
    );
    expect(useWorkspace.getState().documents[0].savedContent).toBe("# Saved");
  });
  it("미저장 문서 닫기 취소 및 문서 전환 후 변경 내용 유지", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = await screen.findByRole("textbox", {
      name: "Markdown 편집기",
    });
    await user.clear(editor);
    await user.type(editor, "# 나의 메모");
    await user.click(screen.getByRole("tab", { name: "시작하기.md" }));
    await user.click(screen.getByRole("button", { name: "README.md 탭 닫기" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "취소" }));
    await user.click(
      within(screen.getByRole("complementary", { name: "탐색기" })).getByRole(
        "button",
        { name: /README.md/ },
      ),
    );
    expect(
      await screen.findByRole("textbox", { name: "Markdown 편집기" }),
    ).toHaveValue("# 나의 메모");
    await user.click(screen.getByRole("button", { name: "미리보기" }));
    expect(
      await screen.findByRole("heading", { name: "나의 메모" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Markdown 편집기" }),
    ).not.toBeInTheDocument();
  });

  it("키보드 검색·사이드바 전환 및 모든 탭 닫기", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("{Control>}k{/Control}");
    const search = screen.getByRole("textbox", { name: "프로젝트 전체 검색" });
    await user.type(search, "아이디어");
    const searchPanel = screen.getByRole("complementary", { name: "검색" });
    expect(
      (
        await within(searchPanel).findAllByRole("button", {
          name: /README\.md/,
        })
      )[0],
    ).toBeInTheDocument();
    expect(
      within(searchPanel).queryByRole("button", { name: "단축키.md" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Control>}b{/Control}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "README.md 탭 닫기" }));
    await user.click(
      screen.getByRole("button", { name: "시작하기.md 탭 닫기" }),
    );
    expect(
      screen.getByRole("heading", { name: "열린 문서 없음" }),
    ).toBeInTheDocument();
  });
});

describe("커스텀 타이틀바", () => {
  it("네이티브 종료는 설정 저장 완료까지 대기", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    let finish = () => {};
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    useSettings.setState({ flush });
    render(<App />);
    await waitFor(() =>
      expect(nativeWindow.onCloseRequested).toHaveBeenCalled(),
    );
    const calls = nativeWindow.onCloseRequested.mock.calls;
    const listener = calls[calls.length - 1][0] as (event: {
      preventDefault: () => void;
    }) => Promise<void>;
    const closing = listener({ preventDefault: vi.fn() });
    await waitFor(() => expect(flush).toHaveBeenCalledOnce());
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await closing;
    });
    expect(nativeWindow.destroy).toHaveBeenCalledOnce();
  });
  it("앱 종료 시 미저장 문서 확인, 취소 또는 버리기 처리", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() =>
      expect(nativeWindow.onCloseRequested).toHaveBeenCalled(),
    );
    act(() =>
      useWorkspace.setState({
        project: { name: "Notes", path: "C:/notes" },
        documents: [
          {
            id: "note.md",
            name: "note.md",
            folder: "",
            content: "changed",
            savedContent: "before",
          },
        ],
        activeId: "note.md",
      }),
    );
    const closeCalls = nativeWindow.onCloseRequested.mock.calls;
    const listener = closeCalls[closeCalls.length - 1][0] as (event: {
      preventDefault: () => void;
    }) => Promise<void>;
    const preventDefault = vi.fn();
    let closing: Promise<void>;
    act(() => {
      closing = listener({ preventDefault });
    });
    await user.click(await screen.findByRole("button", { name: "취소" }));
    await closing!;
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    act(() => {
      closing = listener({ preventDefault });
    });
    await user.click(await screen.findByRole("button", { name: "저장 안 함" }));
    await closing!;
    expect(nativeWindow.destroy).toHaveBeenCalledOnce();
  });
  it("브라우저에서 창 제어 비활성화", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "최소화" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "최대화" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "창 닫기" })).toBeDisabled();
  });

  it("네이티브 창 제어 호출 및 실패 안내", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    nativeWindow.close.mockRejectedValueOnce(new Error("Denied"));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "최소화" }));
    await user.click(screen.getByRole("button", { name: "최대화" }));
    await user.click(screen.getByRole("button", { name: "창 닫기" }));
    expect(nativeWindow.minimize).toHaveBeenCalledOnce();
    expect(nativeWindow.toggleMaximize).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent("창 제어 실패");
  });
});
