import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import MarkdownPreview from "./MarkdownPreview";
import { findTextRanges } from "../workspace/textSearch";
import { useWorkspace } from "../workspace/store";
import { useUi } from "../workbench/uiStore";
import { editorAction } from "../workbench/actions";

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useUi.setState(useUi.getInitialState(), true);
});

it("텍스트 노드를 넘는 일치·대소문자 무시·결과 없음", () => {
  const root = document.createElement("div");
  root.innerHTML = "<p>Hello <strong>wor</strong>ld, hello</p>";
  const ranges = findTextRanges(root, "hello");
  expect(ranges.map((range) => range.toString())).toEqual(["Hello", "hello"]);
  expect(findTextRanges(root, "World")[0].toString()).toBe("world");
  expect(findTextRanges(root, "없음")).toEqual([]);
  expect(findTextRanges(root, "")).toEqual([]);
});

it("미리보기 보기에서 Ctrl+F는 편집으로 바꾸지 않고 찾기 막대를 연다", () => {
  useWorkspace.setState((state) => ({
    layout: { ...state.layout, view: "preview" },
  }));
  editorAction("find");
  expect(useWorkspace.getState().layout.view).toBe("preview");
  expect(useUi.getState().previewFind).toBe(1);
  expect(useUi.getState().command).toBeUndefined();

  editorAction("replace");
  expect(useWorkspace.getState().layout.view).toBe("split");
});

it("찾기 막대: 결과 수·이동·닫기, 마운트 전 요청은 열지 않음", () => {
  const content = "# Alpha\n\nalpha beta\n\nAlpha 끝";
  const { rerender } = render(
    <MarkdownPreview content={content} findToken={1} findEnabled />,
  );
  expect(screen.queryByRole("search")).toBeNull();

  rerender(<MarkdownPreview content={content} findToken={2} findEnabled />);
  const input = screen.getByRole("textbox", { name: "찾을 내용" });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "alpha" } });
  expect(screen.getByText("1/3")).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByText("2/3")).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(screen.getByText("3/3")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "gamma" } });
  expect(screen.getByText("결과 없음")).toBeInTheDocument();

  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("search")).toBeNull();

  // Split view hides it even when a new request arrives.
  rerender(
    <MarkdownPreview content={content} findToken={3} findEnabled={false} />,
  );
  expect(screen.queryByRole("search")).toBeNull();
});

it("내용이 바뀌면 결과를 다시 찾음", async () => {
  const { rerender } = render(
    <MarkdownPreview content={"one\n\ntwo"} findToken={0} findEnabled />,
  );
  rerender(
    <MarkdownPreview content={"one\n\ntwo"} findToken={1} findEnabled />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "찾을 내용" }), {
    target: { value: "o" },
  });
  expect(screen.getByText("1/2")).toBeInTheDocument();
  await act(async () => {
    rerender(
      <MarkdownPreview
        content={"one\n\ntwo\n\nfour"}
        findToken={1}
        findEnabled
      />,
    );
  });
  expect(await screen.findByText("1/3")).toBeInTheDocument();
});
