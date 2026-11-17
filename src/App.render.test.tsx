import { act, fireEvent, render, screen } from "@testing-library/react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { useWorkspace } from "./workspace/store";

const titlebarRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(vi.fn()),
    onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  }),
}));
// Titlebar has no store subscriptions, so it renders only when the tab bar
// or the App shell renders.
vi.mock("./components/Titlebar", () => ({
  default: () => {
    titlebarRenders.count += 1;
    return null;
  },
}));
vi.mock("./components/MarkdownEditor", () => ({
  default: ({
    value,
    onChange,
    onCursor,
  }: {
    value: string;
    onChange: (value: string) => void;
    onCursor: (line: number, column: number) => void;
  }) => (
    <textarea
      aria-label="Markdown 편집기"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        onCursor(1, event.target.value.length + 1);
      }}
    />
  ),
}));

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(invoke).mockResolvedValue(undefined);
  titlebarRenders.count = 0;
});

it("편집·커서 이동 시 App 전체를 다시 렌더링하지 않음", async () => {
  render(<App />);
  const editor = (await screen.findByRole("textbox", {
    name: "Markdown 편집기",
  })) as HTMLTextAreaElement;
  const original = editor.value;

  // The first edit flips the document to dirty, which the tab bar shows.
  fireEvent.change(editor, { target: { value: `${original}a` } });
  await act(async () => {});
  const settled = titlebarRenders.count;

  for (const suffix of ["ab", "abc", "abcd"])
    fireEvent.change(editor, { target: { value: `${original}${suffix}` } });
  await act(async () => {});

  expect(titlebarRenders.count).toBe(settled);
  expect(editor.value).toBe(`${original}abcd`);
  expect(
    screen.getByText(`줄 1, 열 ${original.length + 5}`),
  ).toBeInTheDocument();
  expect(screen.getByText("저장하지 않은 변경 있음")).toBeInTheDocument();
});
