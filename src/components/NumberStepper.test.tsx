import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import NumberStepper from "./NumberStepper";

function Harness({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(13);
  return (
    <>
      <label htmlFor="size">글꼴 크기</label>
      <NumberStepper
        id="size"
        label="글꼴 크기"
        value={value}
        min={10}
        max={32}
        unit="px"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

it("−/+ 버튼·방향키로 1씩 바꾸고 범위 끝에서는 멈춤", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "글꼴 크기" });
  await user.click(screen.getByRole("button", { name: "글꼴 크기 늘리기" }));
  expect(input).toHaveValue(14);
  await user.click(screen.getByRole("button", { name: "글꼴 크기 줄이기" }));
  await user.click(screen.getByRole("button", { name: "글꼴 크기 줄이기" }));
  expect(onChange).toHaveBeenLastCalledWith(12);
  await user.click(input);
  await user.keyboard("{ArrowUp}");
  expect(onChange).toHaveBeenLastCalledWith(13);

  await user.clear(input);
  await user.type(input, "32");
  expect(onChange).toHaveBeenLastCalledWith(32);
  expect(
    screen.getByRole("button", { name: "글꼴 크기 늘리기" }),
  ).toBeDisabled();
});

it("범위 밖이나 빈 값은 저장하지 않고 표시만 하며, 포커스가 떠나면 원래 값으로", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  const input = screen.getByRole("spinbutton", { name: "글꼴 크기" });
  await user.clear(input);
  expect(input).toHaveAttribute("aria-invalid", "true");
  await user.type(input, "99");
  expect(onChange).not.toHaveBeenCalled();
  expect(input).toHaveAttribute("aria-invalid", "true");
  await user.tab();
  expect(input).toHaveValue(13);
  expect(input).toHaveAttribute("aria-invalid", "false");
});
