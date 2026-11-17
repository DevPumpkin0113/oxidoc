import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import FontFamilyInput from "./FontFamilyInput";

const fonts = vi.hoisted(() => ({
  load: vi.fn(async () => [
    { name: "Cascadia Mono", aliases: [], monospace: true },
    { name: "D2Coding", aliases: [], monospace: true },
    { name: "Malgun Gothic", aliases: ["맑은 고딕"], monospace: false },
  ]),
}));
vi.mock("../settings/fonts", async (original) => ({
  ...(await original<typeof import("../settings/fonts")>()),
  loadSystemFonts: fonts.load,
}));

function Harness({ onCommit }: { onCommit: (value: string) => void }) {
  const [value, setValue] = useState("Consolas");
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      <label htmlFor="font">글꼴</label>
      <FontFamilyInput
        key={value}
        id="font"
        value={value}
        invalid={invalid}
        onValidity={(valid) => setInvalid(!valid)}
        onCommit={(next) => {
          setValue(next);
          onCommit(next);
        }}
      />
      <button>바깥</button>
    </>
  );
}

it("설치된 글꼴을 입력으로 거르고 방향키·Enter로 고르면 그 항목만 바꿔 적용", async () => {
  const onCommit = vi.fn();
  const user = userEvent.setup();
  render(<Harness onCommit={onCommit} />);
  const input = screen.getByRole("combobox", { name: "글꼴" });
  await user.click(input);
  expect(
    await screen.findByRole("option", { name: /D2Coding/ }),
  ).toHaveTextContent("고정폭");
  await user.type(input, ", 맑");
  expect(screen.getAllByRole("option").map((item) => item.textContent)).toEqual(
    ["Malgun Gothic맑은 고딕"],
  );
  expect(onCommit).not.toHaveBeenCalled();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onCommit).toHaveBeenLastCalledWith("Consolas, Malgun Gothic");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("목록을 클릭해 고르고, 직접 입력은 포커스가 떠날 때 적용, Esc는 목록을 먼저 닫음", async () => {
  const onCommit = vi.fn();
  const user = userEvent.setup();
  render(<Harness onCommit={onCommit} />);
  const input = screen.getByRole("combobox", { name: "글꼴" });
  await user.clear(input);
  await user.type(input, "cas");
  await user.click(
    await screen.findByRole("option", { name: /Cascadia Mono/ }),
  );
  expect(onCommit).toHaveBeenLastCalledWith("Cascadia Mono");

  const next = screen.getByRole("combobox", { name: "글꼴" });
  await user.click(next);
  await user.type(next, ", My Font");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(next).toHaveValue("Cascadia Mono, My Font");
  await user.click(screen.getByRole("button", { name: "바깥" }));
  await waitFor(() =>
    expect(onCommit).toHaveBeenLastCalledWith("Cascadia Mono, My Font"),
  );
});
