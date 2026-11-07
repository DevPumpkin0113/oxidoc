import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

describe("데스크톱 연결", () => {
  it("브라우저에서는 네이티브 호출 비활성화", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    render(<App />);
    expect(screen.getByRole("button", { name: "앱 연결 확인" })).toBeDisabled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("Rust 응답 표시 및 실패 후 재시도", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("Connection unavailable"))
      .mockResolvedValueOnce({ platform: "windows", version: "0.1.0" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "앱 연결 확인" }));
    expect(await screen.findByText(/앱 연결 확인 실패/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "앱 연결 확인" }));
    expect(
      await screen.findByText(/데스크톱 연결 완료 · windows · v0.1.0/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/앱 연결 확인 실패/)).not.toBeInTheDocument();
  });
});
