import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ContextMenu, { type MenuItem } from "./ContextMenu";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("그룹·체크·단축키 표시, 비활성 항목을 건너뛰는 키보드 탐색", () => {
  const run = vi.fn();
  const items: MenuItem[] = [
    { type: "separator", id: "leading" },
    { label: "Disabled", disabled: true, run },
    { label: "Save", icon: "save", shortcut: "Ctrl+S", run },
    { type: "separator", id: "middle-one" },
    { type: "separator", id: "middle-two" },
    { label: "Checked", checked: true, run },
    { label: "Trash", danger: true, icon: "trash", run },
    { type: "separator", id: "trailing" },
  ];
  render(<ContextMenu x={20} y={20} items={items} onClose={vi.fn()} />);
  const save = screen.getByRole("menuitem", { name: "Save" });
  expect(save).toHaveFocus();
  expect(save).toHaveAttribute("aria-keyshortcuts", "Control+S");
  expect(
    screen.getByRole("menuitemcheckbox", { name: "Checked" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(screen.getAllByRole("separator")).toHaveLength(1);
  fireEvent.keyDown(window, { key: "End" });
  expect(screen.getByRole("menuitem", { name: "Trash" })).toHaveFocus();
  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(save).toHaveFocus();
  fireEvent.keyDown(window, { key: "ArrowUp" });
  expect(screen.getByRole("menuitem", { name: "Trash" })).toHaveFocus();
  fireEvent.keyDown(window, { key: "Home" });
  expect(save).toHaveFocus();
  fireEvent.click(screen.getByRole("menuitem", { name: "Disabled" }));
  expect(run).not.toHaveBeenCalled();
});
it("포커스 밖 Esc·Tab·배경 클릭 닫기와 호출 버튼 포커스 복원", async () => {
  const user = userEvent.setup(),
    run = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        {open ? (
          <ContextMenu
            x={10}
            y={10}
            items={[{ label: "Action", run }]}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.click(trigger);
  fireEvent.keyDown(document.body, { key: "Escape", isComposing: true });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  screen.getByRole("menuitem").blur();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.tab();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  fireEvent.pointerDown(screen.getByRole("menu"));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByRole("menu").parentElement!);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.keyboard("{Enter}");
  expect(run).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
it("실측 메뉴 크기로 화면 경계 조정, 리사이즈 후 위치 재계산", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 280,
    height: 200,
  } as DOMRect);
  vi.stubGlobal("innerWidth", 500);
  vi.stubGlobal("innerHeight", 300);
  render(
    <ContextMenu
      x={490}
      y={295}
      items={[{ label: "Action", run: vi.fn() }]}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("menu")).toHaveStyle({ left: "214px", top: "94px" });
  vi.stubGlobal("innerWidth", 200);
  vi.stubGlobal("innerHeight", 150);
  fireEvent(window, new Event("resize"));
  expect(screen.getByRole("menu")).toHaveStyle({ left: "6px", top: "6px" });
});
it("모든 항목이 비활성이어도 메뉴 포커스·Esc 닫기", () => {
  const close = vi.fn();
  render(
    <ContextMenu
      x={10}
      y={10}
      items={[{ label: "Disabled", disabled: true, run: vi.fn() }]}
      onClose={close}
    />,
  );
  expect(screen.getByRole("menu")).toHaveFocus();
  fireEvent.keyDown(window, { key: "ArrowUp" });
  fireEvent.keyDown(window, { key: "End" });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
it("호출 시 저장한 포커스 사용, 열린 뒤 허용 상태가 바뀐 명령 재검사", () => {
  const source = document.createElement("button");
  document.body.append(source);
  const run = vi.fn(),
    close = vi.fn();
  let allowed = true;
  const { unmount } = render(
    <ContextMenu
      x={10}
      y={10}
      returnFocus={source}
      items={[{ label: "Action", enabled: () => allowed, run }]}
      onClose={close}
    />,
  );
  allowed = false;
  fireEvent.click(screen.getByRole("menuitem"));
  expect(run).not.toHaveBeenCalled();
  unmount();
  expect(source).toHaveFocus();
  source.remove();
});
