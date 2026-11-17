import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import StatusBar from "./StatusBar";
import { useWorkspace, type Document } from "../workspace/store";
import { useCursor } from "../workspace/selectors";

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
