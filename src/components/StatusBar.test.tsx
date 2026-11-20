import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import StatusBar from "./StatusBar";
import { useWorkspace, type Document } from "../workspace/store";
import { useCursor } from "../workspace/selectors";
import { useUpdater } from "../settings/updater";
import { useUi } from "../workbench/uiStore";

const document: Document = {
  id: "a.md",
  name: "a.md",
  folder: "",
  content: "# 제목\n\n본문 두 단어",
  savedContent: "# 제목\n\n본문 두 단어",
};

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useCursor.setState({ line: 1, column: 1, selection: null });
  useWorkspace.setState({ documents: [document], activeId: "a.md" });
});

it("현재 문서의 저장 상태와 글자·단어 수, 선택 시 선택 영역 수를 표시", () => {
  render(<StatusBar />);
  expect(screen.getByText("저장됨")).toBeInTheDocument();
  expect(screen.getByText("11자 · 5단어")).toBeInTheDocument();

  act(() => useWorkspace.getState().edit("a.md", "# 제목 수정"));
  expect(screen.getByText("저장 안 됨")).toBeInTheDocument();
  expect(screen.getByText("7자 · 3단어")).toBeInTheDocument();

  act(() => useCursor.setState({ selection: { characters: 1234, words: 2 } }));
  expect(screen.getByText("선택 1,234자 · 2단어")).toBeInTheDocument();

  act(() =>
    useWorkspace.setState((state) => ({
      documents: state.documents.map((item) => ({
        ...item,
        diskContent: "outside",
      })),
    })),
  );
  expect(screen.getByText("외부에서 변경됨")).toBeInTheDocument();
});

it("업데이트가 있으면 설정 버튼에 레드닷을 표시하고 확인 중·최신이면 숨김", () => {
  useUpdater.setState(useUpdater.getInitialState(), true);
  render(<StatusBar />);
  expect(screen.getByRole("button", { name: "설정" })).toBeInTheDocument();

  act(() => useUpdater.setState({ phase: "available", version: "9.9.9" }));
  const settings = screen.getByRole("button", { name: "설정" });
  expect(settings.querySelector("span[aria-hidden='true']")).not.toBeNull();
  expect(settings).toHaveAttribute("title", "설정 (Ctrl ,) · 업데이트 9.9.9");

  const dot = () =>
    screen
      .getByRole("button", { name: "설정" })
      .querySelector("span[aria-hidden='true']");
  act(() => useUpdater.setState({ phase: "ready" }));
  expect(dot()).not.toBeNull();

  act(() => useUpdater.setState({ phase: "checking" }));
  expect(dot()).toBeNull();
  expect(screen.getByRole("button", { name: "설정" })).toHaveAttribute(
    "title",
    "설정 (Ctrl ,)",
  );
});

it("설정 버튼을 다시 누르면 설정 화면을 닫음", () => {
  useUi.setState({ settingsOpen: false });
  render(<StatusBar />);
  const settings = screen.getByRole("button", { name: "설정" });
  fireEvent.click(settings);
  expect(useUi.getState().settingsOpen).toBe(true);
  expect(settings).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(settings);
  expect(useUi.getState().settingsOpen).toBe(false);
});
