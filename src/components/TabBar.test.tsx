import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import TabBar from "./TabBar";
import { useWorkspace, type Document } from "../workspace/store";

vi.mock("./Titlebar", () => ({ default: () => null }));

const document = (id: string): Document => ({
  id,
  name: id.split("/").pop()!,
  folder: id.split("/").slice(0, -1).join("/"),
  content: "",
  savedContent: "",
});

function transfer() {
  const data: Record<string, string> = {};
  return {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return Object.keys(data);
    },
    setData: (type: string, value: string) => {
      data[type] = value;
    },
    getData: (type: string) => data[type] ?? "",
  };
}

const order = () =>
  useWorkspace.getState().documents.map((document) => document.id);

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useWorkspace.setState({
    project: { name: "Notes", path: "C:/notes" },
    documents: [
      document("a.md"),
      document("docs/README.md"),
      document("README.md"),
    ],
    activeId: "a.md",
  });
});

it("같은 이름 탭에 폴더를 덧붙이고 전체 경로를 툴팁으로 표시", () => {
  render(<TabBar />);
  const nested = screen.getByRole("tab", { name: /README\.md\s*docs/ });
  expect(nested).toHaveAttribute("title", "docs/README.md");
  expect(screen.getByRole("tab", { name: /README\.md\s*\./ })).toHaveAttribute(
    "title",
    "README.md",
  );
  expect(screen.getByRole("tab", { name: "a.md" })).toBeInTheDocument();
});

it("탭을 끌어 다른 탭 뒤에 놓으면 순서가 바뀜", () => {
  render(<TabBar />);
  const dragged = screen.getByRole("tab", { name: "a.md" }).parentElement!;
  const target = screen.getByRole("tab", {
    name: /README\.md\s*\./,
  }).parentElement!;
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    left: 100,
    width: 100,
  } as DOMRect);
  const dataTransfer = transfer();
  // jsdom has no DragEvent, so pointer coordinates are set on the event.
  const at = (event: Event) => {
    Object.defineProperty(event, "clientX", { value: 180 });
    return event;
  };
  fireEvent.dragStart(dragged, { dataTransfer });
  fireEvent(target, at(createEvent.dragOver(target, { dataTransfer })));
  expect(target.className).toContain("dropAfter");
  fireEvent(target, at(createEvent.drop(target, { dataTransfer })));
  expect(order()).toEqual(["docs/README.md", "README.md", "a.md"]);
  expect(target.className).not.toContain("dropAfter");
});

it("가운데 클릭으로 탭 닫기", async () => {
  render(<TabBar />);
  const tab = screen.getByRole("tab", { name: "a.md" }).parentElement!;
  fireEvent.mouseDown(tab, { button: 1 });
  fireEvent(tab, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  await waitFor(() => expect(order()).not.toContain("a.md"));
});
