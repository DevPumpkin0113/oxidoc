import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import AppUpdate from "./AppUpdate";
import { useUpdater } from "../settings/updater";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
beforeEach(() => {
  useUpdater.setState(useUpdater.getInitialState(), true);
  vi.mocked(isTauri).mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
it("available/download/verified states and safe release note rendering", async () => {
  const user = userEvent.setup();
  const onInstall = vi.fn();
  const download = vi.fn();
  useUpdater.setState({
    phase: "available",
    version: "0.3.0",
    notes: "<script>unsafe()</script>",
    download,
  });
  const { container } = render(<AppUpdate onInstall={onInstall} />);
  expect(screen.getByText("새 버전: 0.3.0")).toBeInTheDocument();
  expect(container.querySelector("script")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "설치 및 재시작" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "업데이트 다운로드" }));
  expect(download).toHaveBeenCalledOnce();
  act(() =>
    useUpdater.setState({ phase: "downloading", total: 100, downloaded: 25 }),
  );
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "25");
  expect(screen.getByRole("button", { name: "업데이트 확인" })).toBeDisabled();
  act(() => useUpdater.setState({ phase: "ready" }));
  await user.click(screen.getByRole("button", { name: "설치 및 재시작" }));
  expect(onInstall).toHaveBeenCalledOnce();
});
it("browser cannot perform native updates and failed download offers retry", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  useUpdater.setState({
    phase: "error",
    version: "0.3.0",
    error: "signature invalid",
  });
  render(<AppUpdate onInstall={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("signature invalid");
  expect(screen.getByRole("button", { name: "업데이트 확인" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "업데이트 다운로드" }),
  ).toBeDisabled();
});
