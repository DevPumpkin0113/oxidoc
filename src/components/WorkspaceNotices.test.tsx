import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspace } from "../workspace/store";
import { ErrorNotice } from "./WorkspaceNotices";

beforeEach(() => {
  vi.useFakeTimers();
  useWorkspace.setState(useWorkspace.getInitialState(), true);
});
afterEach(() => vi.useRealTimers());

it("오류 토스트는 잠시 뒤 사라지고, 마우스를 올린 동안은 유지", () => {
  render(<ErrorNotice />);
  act(() => useWorkspace.setState({ error: "저장 실패" }));
  const toast = screen.getByRole("alert");
  expect(toast).toHaveTextContent("저장 실패");

  fireEvent.mouseEnter(toast);
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByRole("alert")).toBeInTheDocument();

  fireEvent.mouseLeave(toast);
  act(() => vi.advanceTimersByTime(6_000));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(useWorkspace.getState().error).toBe("");
});
