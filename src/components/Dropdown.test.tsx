import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import Dropdown from "./Dropdown";

const options = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana", disabled: true },
  { value: "c", label: "Cherry" },
  { value: "d", label: "Date" },
];

function Harness({
  onChange = vi.fn(),
}: {
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState("a");
  return (
    <>
      <Dropdown
        label="과일"
        value={value}
        options={options}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <button>바깥</button>
    </>
  );
}

const combobox = () => screen.getByRole("combobox", { name: "과일" });
const activeOption = () =>
  document.getElementById(combobox().getAttribute("aria-activedescendant")!);

it("방향키·Home·End로 비활성 항목을 건너뛰며 이동하고 Enter·Space로 선택", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  expect(combobox()).toHaveTextContent("Apple");
  await user.tab();
  expect(combobox()).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(combobox()).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(activeOption()).toHaveTextContent("Apple");
  await user.keyboard("{ArrowDown}");
  expect(activeOption()).toHaveTextContent("Cherry");
  await user.keyboard("{End}");
  expect(activeOption()).toHaveTextContent("Date");
  await user.keyboard("{Home}");
  expect(activeOption()).toHaveTextContent("Apple");
  await user.keyboard("{End}{Enter}");
  expect(onChange).toHaveBeenLastCalledWith("d");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(combobox()).toHaveTextContent("Date");
  expect(combobox()).toHaveFocus();
  await user.keyboard(" {ArrowUp} ");
  expect(onChange).toHaveBeenLastCalledWith("c");
});

it("Esc·Tab·바깥 클릭으로 닫고 포커스는 버튼에 남으며, 글자 입력으로 항목 찾기", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  await user.click(combobox());
  expect(screen.getByRole("listbox", { name: "과일" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(combobox()).toHaveFocus();

  await user.click(combobox());
  await user.click(screen.getByRole("button", { name: "바깥" }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  await user.click(combobox());
  await user.click(screen.getByRole("option", { name: "Banana" }));
  expect(onChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("option", { name: "Cherry" }));
  expect(onChange).toHaveBeenLastCalledWith("c");

  combobox().focus();
  await user.keyboard("d");
  expect(onChange).toHaveBeenLastCalledWith("d");
  await user.keyboard("{ArrowDown}b");
  expect(activeOption()).toHaveTextContent("Date");
  await user.keyboard("{Tab}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("열 때 활성 항목 위치를 맞춰도 바깥 스크롤 영역을 건드리지 않아 바로 닫히지 않음", async () => {
  // scrollIntoView scrolls every scrollable ancestor; a scroll outside the
  // list closes it, so opening must not use it.
  const scrollIntoView = vi.fn(function (this: Element) {
    document.body.dispatchEvent(new Event("scroll"));
  });
  Element.prototype.scrollIntoView = scrollIntoView;
  try {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(combobox());
    await user.keyboard("{End}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  } finally {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  }
});
