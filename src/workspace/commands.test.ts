import { beforeEach, expect, it, vi } from "vitest";
import {
  canExecuteCommand,
  executeCommand,
  matchesShortcut,
  scopeMenu,
  type Action,
} from "./commands";
import { useWorkspace } from "./store";

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useWorkspace.setState({
    desktop: true,
    project: { name: "Notes", path: "C:/notes" },
    projects: [{ name: "Notes", path: "C:/notes" }],
    tree: {
      "": [
        { name: "a.md", path: "a.md", isDirectory: false },
        { name: "b.md", path: "b.md", isDirectory: false },
      ],
    },
    documents: [
      { id: "a.md", name: "a.md", folder: "", content: "a", savedContent: "a" },
      { id: "b.md", name: "b.md", folder: "", content: "b", savedContent: "b" },
    ],
    activeId: "b.md",
  });
});
it("우클릭 대상을 유지하고 프로젝트 전환·항목 제거·busy 후 재검사", async () => {
  const run = vi.fn();
  const [action] = scopeMenu([{ label: "Rename", run: () => run("a.md") }], {
    kind: "entry",
    root: "C:/notes",
    path: "a.md",
  });
  if (action.type === "separator") throw Error("action expected");
  expect(await executeCommand(action)).toBe(true);
  expect(run).toHaveBeenLastCalledWith("a.md");
  useWorkspace.setState({ busy: true });
  expect(await executeCommand(action)).toBe(false);
  useWorkspace.setState({
    busy: false,
    project: { name: "Other", path: "C:/other" },
  });
  expect(await executeCommand(action)).toBe(false);
  useWorkspace.setState({
    project: { name: "Notes", path: "C:/notes" },
    tree: { "": [] },
  });
  expect(await executeCommand(action)).toBe(false);
  expect(run).toHaveBeenCalledOnce();
});
it("문서 명령의 활성 문서/프로젝트 문맥과 등록 프로젝트 제거 검사", async () => {
  const run = vi.fn();
  const action: Action = {
    label: "Find",
    run,
    target: { kind: "document", root: "C:/notes", id: "a.md", active: true },
  };
  expect(canExecuteCommand(action)).toBe(false);
  useWorkspace.setState({ activeId: "a.md" });
  expect(await executeCommand(action)).toBe(true);
  const projectAction: Action = {
    label: "Manage",
    run,
    target: { kind: "project", path: "C:/notes" },
  };
  expect(canExecuteCommand(projectAction)).toBe(true);
  useWorkspace.setState({ projects: [] });
  expect(canExecuteCommand(projectAction)).toBe(false);
});
it("비활성·브라우저·동적 조건 차단, 허용한 보기 명령은 busy 중 실행", async () => {
  const run = vi.fn();
  for (const patch of [
    { disabled: true },
    { enabled: () => false },
    { requiresDesktop: true },
  ]) {
    useWorkspace.setState({ desktop: false });
    expect(await executeCommand({ label: "Blocked", run, ...patch })).toBe(
      false,
    );
  }
  useWorkspace.setState({ busy: true });
  expect(await executeCommand({ label: "Sidebar", run, allowBusy: true })).toBe(
    true,
  );
  expect(run).toHaveBeenCalledOnce();
});
it("비동기 명령 실패를 앱 오류로 전달", async () => {
  expect(
    await executeCommand({
      label: "Failure",
      run: async () => {
        throw Error("operation failed");
      },
    }),
  ).toBe(false);
  expect(useWorkspace.getState().error).toContain("operation failed");
});
it("단축키 정의의 정확한 modifier·IME·기본 처리 검사", () => {
  const action = { label: "Save As", shortcut: "Ctrl+Shift+S", run: vi.fn() };
  expect(
    matchesShortcut(
      action,
      new KeyboardEvent("keydown", { key: "S", ctrlKey: true, shiftKey: true }),
    ),
  ).toBe(true);
  expect(
    matchesShortcut(
      action,
      new KeyboardEvent("keydown", { key: "s", metaKey: true, shiftKey: true }),
    ),
  ).toBe(true);
  expect(
    matchesShortcut(
      action,
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true }),
    ),
  ).toBe(false);
  expect(
    matchesShortcut(
      action,
      new KeyboardEvent("keydown", {
        key: "S",
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
      }),
    ),
  ).toBe(false);
  expect(
    matchesShortcut(
      action,
      new KeyboardEvent("keydown", {
        key: "S",
        ctrlKey: true,
        shiftKey: true,
        isComposing: true,
      }),
    ),
  ).toBe(false);
  const handled = new KeyboardEvent("keydown", {
    key: "S",
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  });
  handled.preventDefault();
  expect(matchesShortcut(action, handled)).toBe(false);
});
