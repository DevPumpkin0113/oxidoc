import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MarkdownEditor from "./MarkdownEditor";

const monacoMock = vi.hoisted(() => {
  const normalize = (value: string) => value.replace(/\r\n|\r/g, "\n");
  const createModel = vi.fn((initial: string) => {
    let value = normalize(initial);
    const listeners = new Set<() => void>();
    return {
      getValue: () => value,
      setValue: (next: string) => {
        value = normalize(next);
        listeners.forEach((listener) => listener());
      },
      updateOptions: vi.fn(),
      isDisposed: () => false,
      dispose: vi.fn(),
      listeners,
    };
  });
  const disposable = () => ({ dispose: vi.fn() });
  const create = vi.fn(
    (
      _container: unknown,
      options: { model: ReturnType<typeof createModel> },
    ) => ({
      getModel: () => options.model,
      getValue: () => options.model.getValue(),
      updateOptions: vi.fn(),
      onContextMenu: disposable,
      onDidChangeModelContent: (listener: () => void) => {
        options.model.listeners.add(listener);
        return { dispose: () => options.model.listeners.delete(listener) };
      },
      onDidChangeCursorPosition: disposable,
      onDidScrollChange: disposable,
      saveViewState: () => ({}),
      restoreViewState: vi.fn(),
      dispose: vi.fn(),
    }),
  );
  return { createModel, create };
});
vi.mock("monaco-editor/editor/editor.api.js", () => ({
  editor: {
    ...monacoMock,
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));
vi.mock("monaco-editor/languages/definitions/markdown/register.js", () => ({}));
vi.mock(
  "monaco-editor/editor/contrib/find/browser/findController.js",
  () => ({}),
);
vi.mock("monaco-editor/editor/editor.worker.js?worker", () => ({
  default: class {},
}));
vi.mock("../settings/monacoLocale", () => ({
  setMonacoLanguage: vi.fn(),
  localizeFindWidget: () => vi.fn(),
}));

it("혼합 줄바꿈 문서 로드·수정 버리기·재열기 시 변경 알림 차단", () => {
  const original = "# Heading\r\nfirst\nlast\r\n";
  const onChange = vi.fn();
  const props = {
    documentId: "mixed.md",
    value: original,
    onChange,
    onCursor: vi.fn(),
  };
  const view = render(<MarkdownEditor {...props} />);
  expect(onChange).not.toHaveBeenCalled();
  const results = monacoMock.create.mock.results;
  const model = results[results.length - 1].value.getModel();
  act(() => model.setValue("edited\n"));
  expect(onChange).toHaveBeenLastCalledWith("edited\n");
  view.rerender(<MarkdownEditor {...props} value="edited\n" />);
  view.unmount();
  onChange.mockClear();
  render(<MarkdownEditor {...props} />);
  expect(onChange).not.toHaveBeenCalled();
  expect(model.getValue()).toBe("# Heading\nfirst\nlast\n");
});

it("외부 value 동기화는 변경 알림 없이 적용, 이후 사용자 편집은 정상 전달", () => {
  const onChange = vi.fn();
  const props = {
    documentId: "sync.md",
    value: "before",
    onChange,
    onCursor: vi.fn(),
  };
  const view = render(<MarkdownEditor {...props} />);
  view.rerender(<MarkdownEditor {...props} value="from disk\r\nnext\n" />);
  expect(onChange).not.toHaveBeenCalled();
  const results = monacoMock.create.mock.results;
  const model = results[results.length - 1].value.getModel();
  act(() => model.setValue("user edit"));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("user edit");
});

it("탭 전환 시 다른 문서에 변경 알림 없이 미저장 버퍼 유지", () => {
  const onFirstChange = vi.fn();
  const onSecondChange = vi.fn();
  const props = {
    documentId: "first.md",
    value: "first",
    onChange: onFirstChange,
    onCursor: vi.fn(),
  };
  const view = render(<MarkdownEditor {...props} />);
  const results = monacoMock.create.mock.results;
  const firstModel = results[results.length - 1].value.getModel();
  act(() => firstModel.setValue("unsaved first"));
  onFirstChange.mockClear();
  view.rerender(
    <MarkdownEditor
      {...props}
      documentId="second.md"
      value="second\r\nline\n"
      onChange={onSecondChange}
    />,
  );
  expect(onSecondChange).not.toHaveBeenCalled();
  view.rerender(<MarkdownEditor {...props} value="unsaved first" />);
  expect(firstModel.getValue()).toBe("unsaved first");
  expect(onFirstChange).not.toHaveBeenCalled();
});
