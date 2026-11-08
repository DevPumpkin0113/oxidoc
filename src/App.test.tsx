import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useWorkspace } from "./workspace/store";
import { useSettings } from "./settings/store";

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

describe("작업 공간 UI", () => {
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
    const root = screen.getByText("project-folder").closest("details")!;
    const user = userEvent.setup();
    await user.click(within(root).getByRole("button", { name: "새 문서" }));
    expect(root).toHaveAttribute("open");
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
      screen.getByRole("button", { name: "다운로드 및 설치" }),
    ).toBeDisabled();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
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
