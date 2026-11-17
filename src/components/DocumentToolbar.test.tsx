import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import DocumentToolbar from "./DocumentToolbar";
import { useWorkspace } from "../workspace/store";
import { useUi } from "../workbench/uiStore";

const document = { id: "a.md", name: "a.md", folder: "", dirty: true };

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useWorkspace.setState({
    project: { name: "Notes", path: "C:/notes" },
    desktop: true,
  });
});

it("도구 버튼은 기능 이름에 단축키를 붙인 툴팁을 일관되게 표시", () => {
  render(<DocumentToolbar document={document} />);
  const expectations: [string, string][] = [
    ["문서 내 찾기", "문서 내 찾기 (Ctrl F)"],
    ["문서 내 바꾸기", "문서 내 바꾸기 (Ctrl H)"],
    ["실행 취소", "실행 취소 (Ctrl Z)"],
    ["다시 실행", "다시 실행 (Ctrl Y)"],
    ["문서 개요", "문서 개요"],
    ["다른 이름으로 저장", "다른 이름으로 저장 (Ctrl Shift S)"],
    ["저장", "저장 (Ctrl S)"],
  ];
  for (const [name, title] of expectations)
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "title",
      title,
    );
});

it("더 보기 메뉴는 좁은 폭에서 숨는 명령과 켜짐 상태를 제공", () => {
  useWorkspace.getState().setLayout({ outline: true, sync: false });
  render(<DocumentToolbar document={document} />);
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  const menu = useUi.getState().menu!;
  expect(menu.title).toBe("더 보기");
  const actions = menu.items.filter((item) => item.type !== "separator");
  expect(actions.map((item) => item.label)).toEqual([
    "실행 취소",
    "다시 실행",
    "문서 개요",
    "스크롤 동기화",
    "다른 이름으로 저장",
  ]);
  const checked = (label: string) =>
    actions.find((item) => item.label === label)?.checked;
  expect(checked("문서 개요")).toBe(true);
  expect(checked("스크롤 동기화")).toBe(false);
  void actions.find((item) => item.label === "스크롤 동기화")!.run();
  expect(useWorkspace.getState().layout.sync).toBe(true);
});
