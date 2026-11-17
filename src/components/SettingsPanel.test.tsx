import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

it("섹션 목록으로 이동하고, 검색은 이름·설명·테마 이름으로 항목을 거르며 Esc로 지움", async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const user = userEvent.setup();
  render(<SettingsPanel onInstallUpdate={vi.fn()} />);
  const nav = screen.getByRole("navigation", { name: "설정 섹션" });
  expect(
    within(nav)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["일반", "모양", "편집기", "미리보기", "정보"]);
  await user.click(within(nav).getByRole("button", { name: "편집기" }));
  expect(scrollIntoView).toHaveBeenCalled();
  expect(within(nav).getByRole("button", { name: "편집기" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(screen.getByRole("heading", { name: "편집기" })).toHaveFocus();
  expect(
    within(screen.getByRole("group", { name: "편집기" })).getByLabelText(
      "편집기 글꼴 크기",
    ),
  ).toBeInTheDocument();

  const search = screen.getByRole("searchbox", { name: "설정 검색" });
  await user.type(search, "dracula");
  expect(screen.getByRole("button", { name: "Dracula" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다크 테마" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.queryByRole("button", { name: "GitHub Light" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("표시 언어")).not.toBeInTheDocument();
  expect(within(nav).getByRole("button", { name: "일반" })).toBeDisabled();

  await user.clear(search);
  await user.type(search, "글꼴 크기");
  expect(screen.getByLabelText("인터페이스 글꼴 크기")).toBeInTheDocument();
  expect(screen.getByLabelText("미리보기 글꼴 크기")).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();

  await user.clear(search);
  await user.type(search, "없는 설정");
  expect(screen.getByRole("status")).toHaveTextContent(
    "'없는 설정'에 맞는 설정이 없습니다.",
  );
  await user.keyboard("{Escape}");
  expect(search).toHaveValue("");
  expect(screen.getByLabelText("표시 언어")).toBeInTheDocument();
});

it("테마는 적용 중인 종류를 먼저 보이고 라이트·다크 전환, 색상 모드를 바꾸면 그 종류로", async () => {
  const update = vi.fn(async () => {});
  useSettings.setState({ update, systemDark: false });
  const user = userEvent.setup();
  const view = render(<SettingsPanel onInstallUpdate={vi.fn()} />);
  const light = screen.getByRole("button", { name: "라이트 테마" });
  expect(light).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("button", { name: "VS Code Light Modern" }),
  ).toHaveTextContent("적용 중");
  expect(
    screen.queryByRole("button", { name: "Dracula" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "다크 테마" }));
  await user.click(screen.getByRole("button", { name: "Dracula" }));
  expect(update).toHaveBeenLastCalledWith({ darkTheme: "dracula" });

  await user.click(screen.getByRole("combobox", { name: "색상 모드" }));
  await user.click(screen.getByRole("option", { name: "라이트" }));
  useSettings.setState((state) => ({
    settings: { ...state.settings, mode: "light" },
  }));
  view.rerender(<SettingsPanel onInstallUpdate={vi.fn()} />);
  expect(screen.getByRole("button", { name: "라이트 테마" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("기본값과 다른 항목에만 되돌리기 버튼을 보이고 누르면 그 항목만 기본값으로", async () => {
  const update = vi.fn(async () => {});
  useSettings.setState((state) => ({
    update,
    systemDark: false,
    settings: {
      ...state.settings,
      editorFontSize: 20,
      lightTheme: "github-light",
      editorWordWrap: false,
    },
  }));
  const user = userEvent.setup();
  render(<SettingsPanel onInstallUpdate={vi.fn()} />);
  expect(
    screen
      .getAllByRole("button", { name: /기본값으로 되돌리기$/ })
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual([
    // The test setup fixes the language to Korean instead of "system".
    "표시 언어 기본값으로 되돌리기",
    "라이트 테마 기본값으로 되돌리기",
    "편집기 글꼴 크기 기본값으로 되돌리기",
    "자동 줄 바꿈 기본값으로 되돌리기",
  ]);
  await user.click(
    screen.getByRole("button", {
      name: "편집기 글꼴 크기 기본값으로 되돌리기",
    }),
  );
  expect(update).toHaveBeenLastCalledWith({ editorFontSize: 13 });
  await user.click(
    screen.getByRole("button", { name: "라이트 테마 기본값으로 되돌리기" }),
  );
  expect(update).toHaveBeenLastCalledWith({ lightTheme: "light-modern" });
});
