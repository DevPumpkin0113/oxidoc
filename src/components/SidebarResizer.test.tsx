import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import SidebarResizer from "./SidebarResizer";
import { defaultLayout, useWorkspace } from "../workspace/store";

const width = () => useWorkspace.getState().layout.sidebarWidth;

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useWorkspace.setState({ layout: { ...defaultLayout, sidebarWidth: 240 } });
});

function setup() {
  const workbench = document.createElement("div");
  document.body.append(workbench);
  render(<SidebarResizer />, { container: workbench });
  const handle = screen.getByRole("separator", { name: "사이드바 너비" });
  handle.setPointerCapture = () => {};
  return { workbench, handle };
}

it("끄는 동안 화면만 바꾸고 놓을 때 범위 안의 너비로 저장", () => {
  const { workbench, handle } = setup();
  fireEvent.pointerDown(handle, { button: 0, clientX: 240, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 340, pointerId: 1 });
  expect(workbench.style.getPropertyValue("--sidebar-width")).toBe("340px");
  expect(width()).toBe(240);
  fireEvent.pointerUp(handle, { clientX: 2000, pointerId: 1 });
  expect(width()).toBe(600);
  expect(workbench.style.getPropertyValue("--sidebar-width")).toBe("600px");
});

it("방향키·Home·End로 조절하고 더블클릭하면 기본 너비", () => {
  const { handle } = setup();
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(width()).toBe(256);
  fireEvent.keyDown(handle, { key: "Home" });
  expect(width()).toBe(180);
  fireEvent.keyDown(handle, { key: "End" });
  expect(width()).toBe(600);
  fireEvent.doubleClick(handle);
  expect(width()).toBe(240);
  expect(handle).toHaveAttribute("aria-valuenow", "240");
});

it("최소 너비보다 더 왼쪽으로 끌면 접히는 모습을 보여 주고 놓으면 사이드바를 닫음", () => {
  const { workbench, handle } = setup();
  fireEvent.pointerDown(handle, { button: 0, clientX: 240, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 150, pointerId: 1 });
  expect(workbench.hasAttribute("data-sidebar-collapsing")).toBe(false);
  fireEvent.pointerMove(handle, { clientX: 60, pointerId: 1 });
  expect(workbench.hasAttribute("data-sidebar-collapsing")).toBe(true);
  fireEvent.pointerUp(handle, { clientX: 60, pointerId: 1 });
  expect(useWorkspace.getState().layout.sidebar).toBe(false);
  expect(width()).toBe(240);
  expect(workbench.hasAttribute("data-sidebar-collapsing")).toBe(false);
});

it("끄는 중 취소되면 원래 너비로 되돌림", () => {
  const { workbench, handle } = setup();
  fireEvent.pointerDown(handle, { button: 0, clientX: 240, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
  fireEvent.pointerCancel(handle, { clientX: 400, pointerId: 1 });
  expect(width()).toBe(240);
  expect(workbench.style.getPropertyValue("--sidebar-width")).toBe("240px");
});
