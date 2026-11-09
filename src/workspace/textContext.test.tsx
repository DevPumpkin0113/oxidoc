import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inputMenu } from "./textContext";
import { executeCommand, type Action } from "./commands";
import { editorTextAction } from "./editorTextActions";
import type { editor } from "monaco-editor/editor/editor.api.js";
import { useWorkspace } from "./store";

const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const clipboard = { writeText: vi.fn(), readText: vi.fn() };
beforeEach(() => {
  clipboard.writeText.mockReset().mockResolvedValue(undefined);
  clipboard.readText.mockReset().mockResolvedValue("inserted");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
});
afterEach(() => {
  if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});
function Input({ readonly = false }: { readonly?: boolean }) {
  const [value, setValue] = useState("hello notes");
  return (
    <>
      <input
        value={value}
        readOnly={readonly}
        onChange={(event) => setValue(event.target.value)}
      />
      <output>{value}</output>
    </>
  );
}
function action(input: HTMLInputElement, label: string) {
  return inputMenu(input).find(
    (item) => item.type !== "separator" && item.label === label,
  ) as Action;
}
it("입력란 잘라내기·붙여넣기가 React 제어 상태까지 갱신", async () => {
  render(<Input />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  input.setSelectionRange(0, 5);
  await act(async () => {
    await executeCommand(action(input, "잘라내기"));
  });
  expect(clipboard.writeText).toHaveBeenCalledWith("hello");
  expect(screen.getByRole("status")).toHaveTextContent("notes");
  expect(input.value).toBe(" notes");
  input.setSelectionRange(0, 0);
  await act(async () => {
    await executeCommand(action(input, "붙여넣기"));
  });
  expect(input.value).toBe("inserted notes");
  expect(screen.getByRole("status")).toHaveTextContent("inserted notes");
});
it("입력 내용 변경 중 붙여넣기 취소 및 읽기 전용 수정 차단", async () => {
  render(<Input />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  let finish: (value: string) => void = () => {};
  clipboard.readText.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const pasting = action(input, "붙여넣기").run();
  fireEvent.change(input, { target: { value: "newer value" } });
  finish("old clipboard");
  await expect(pasting).rejects.toThrow("내용이 변경");
  expect(input.value).toBe("newer value");
  input.readOnly = true;
  input.setSelectionRange(0, 3);
  expect(await executeCommand(action(input, "잘라내기"))).toBe(false);
  expect(await executeCommand(action(input, "붙여넣기"))).toBe(false);
  expect(await executeCommand(action(input, "복사"))).toBe(true);
});
function editorFixture() {
  const range = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 4,
    isEmpty: () => false,
  };
  let version = 1;
  const model = {
    getVersionId: () => version,
    isDisposed: () => false,
    getValueInRange: () => "old",
    getEOL: () => "\n",
    getFullModelRange: () => range,
  };
  const editorMock = {
    getModel: vi.fn(() => model),
    getSelection: () => range,
    getSelections: vi.fn(() => [range]),
    setSelection: vi.fn(),
    pushUndoStop: vi.fn(),
    executeEdits: vi.fn(),
  };
  return {
    instance: editorMock as unknown as editor.IStandaloneCodeEditor,
    editorMock,
    bump: () => {
      version++;
    },
  };
}
it("편집기 붙여넣기·모두 선택 및 실행 취소 경계 유지", async () => {
  const { instance, editorMock } = editorFixture();
  await editorTextAction(instance, "paste", () => false);
  expect(editorMock.executeEdits).toHaveBeenCalledWith("context-menu", [
    expect.objectContaining({ text: "inserted" }),
  ]);
  expect(editorMock.pushUndoStop).toHaveBeenCalledTimes(2);
  await editorTextAction(instance, "selectAll", () => true);
  expect(editorMock.setSelection).toHaveBeenCalledOnce();
});
it("다중 선택 복사·잘라내기 및 커서별 줄 붙여넣기", async () => {
  const { instance, editorMock } = editorFixture();
  const first = editorMock.getSelections()[0];
  const second = { ...first, startLineNumber: 2, endLineNumber: 2 };
  editorMock.getSelections.mockReturnValue([first, second]);
  await editorTextAction(instance, "copy", () => false);
  expect(clipboard.writeText).toHaveBeenLastCalledWith("old\nold");
  await editorTextAction(instance, "cut", () => false);
  expect(editorMock.executeEdits).toHaveBeenLastCalledWith("context-menu", [
    expect.objectContaining({ range: first, text: "" }),
    expect.objectContaining({ range: second, text: "" }),
  ]);
  clipboard.readText.mockResolvedValueOnce("one\ntwo");
  await editorTextAction(instance, "paste", () => false);
  expect(editorMock.executeEdits).toHaveBeenLastCalledWith("context-menu", [
    expect.objectContaining({ range: first, text: "one" }),
    expect.objectContaining({ range: second, text: "two" }),
  ]);
});
it("편집기 잘라내기 대기 중 내용 변경 시 삭제 차단, 읽기 전용 붙여넣기 차단", async () => {
  const { instance, editorMock, bump } = editorFixture();
  let finish: () => void = () => {};
  clipboard.writeText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const cutting = editorTextAction(instance, "cut", () => false);
  bump();
  finish();
  await expect(cutting).rejects.toThrow("내용이 변경");
  expect(editorMock.executeEdits).not.toHaveBeenCalled();
  await editorTextAction(instance, "paste", () => true);
  expect(clipboard.readText).not.toHaveBeenCalled();
});
it("클립보드 접근 거절 시 입력 보존 및 앱 오류 전달", async () => {
  render(<Input />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  input.setSelectionRange(0, 5);
  clipboard.writeText.mockRejectedValueOnce(Error("clipboard denied"));
  expect(await executeCommand(action(input, "잘라내기"))).toBe(false);
  expect(input.value).toBe("hello notes");
  expect(useWorkspace.getState().error).toContain("clipboard denied");
});
