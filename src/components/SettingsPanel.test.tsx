import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel";
import { useSettings } from "../settings/store";

vi.mock("./AppUpdate", () => ({ default: () => null }));

it("편집기 글꼴은 Enter·포커스 해제 때 적용하고 잘못된 이름은 거부, 줄 바꿈은 즉시 전환", () => {
  const update = vi.fn(async () => {});
  useSettings.setState({ update });
  render(<SettingsPanel onInstallUpdate={vi.fn()} />);

  const font = screen.getByLabelText("글꼴");
  fireEvent.change(font, { target: { value: " D2Coding " } });
  expect(update).not.toHaveBeenCalled();
  fireEvent.keyDown(font, { key: "Enter" });
  expect(update).toHaveBeenLastCalledWith({ editorFontFamily: "D2Coding" });

  update.mockClear();
  fireEvent.change(font, { target: { value: "x; } body {" } });
  fireEvent.blur(font);
  expect(update).not.toHaveBeenCalled();
  expect(font).toHaveAttribute("aria-invalid", "true");
  fireEvent.keyDown(font, { key: "Escape" });
  expect(font).toHaveValue("");
  expect(font).toHaveAttribute("aria-invalid", "false");

  const wrap = screen.getByRole("switch", { name: "자동 줄 바꿈" });
  expect(wrap).toBeChecked();
  fireEvent.click(wrap);
  expect(update).toHaveBeenLastCalledWith({ editorWordWrap: false });
});
