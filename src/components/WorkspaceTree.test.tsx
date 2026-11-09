import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WorkspaceTree from "./WorkspaceTree";
import TreeDropTarget from "./TreeDropTarget";
import { blockExternalFileDrop, endFileDrag } from "../workspace/treeDrag";
import { useWorkspace } from "../workspace/store";

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
beforeEach(() => {
  endFileDrag();
  useWorkspace.setState(useWorkspace.getInitialState(), true);
});
afterEach(cleanup);
it("외부 OS 파일 드롭의 WebView 기본 열기 차단, 내부 드래그 허용", () => {
  const target = document.createElement("div");
  document.body.append(target);
  const childDrop = vi.fn();
  target.addEventListener("drop", childDrop);
  document.addEventListener("drop", blockExternalFileDrop, true);
  try {
    const external = new Event("drop", { bubbles: true, cancelable: true });
    const externalTransfer = { types: ["Files"], dropEffect: "move" };
    Object.defineProperty(external, "dataTransfer", {
      value: externalTransfer,
    });
    target.dispatchEvent(external);
    expect(external.defaultPrevented).toBe(true);
    expect(externalTransfer.dropEffect).toBe("none");
    expect(childDrop).not.toHaveBeenCalled();
    const internal = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(internal, "dataTransfer", {
      value: { types: ["application/x-oxidoc-file"] },
    });
    target.dispatchEvent(internal);
    expect(internal.defaultPrevented).toBe(false);
    expect(childDrop).toHaveBeenCalledOnce();
  } finally {
    document.removeEventListener("drop", blockExternalFileDrop, true);
    target.remove();
  }
});
function setup() {
  const moveFile = vi.fn().mockResolvedValue(true);
  useWorkspace.setState({
    desktop: true,
    project: { name: "Notes", path: "C:/notes" },
    moveFile,
    tree: {
      "": [
        { name: "source", path: "source", isDirectory: true },
        { name: "target", path: "target", isDirectory: true },
      ],
      source: [{ name: "a.md", path: "source/a.md", isDirectory: false }],
      target: [],
    },
  });
  render(
    <details open>
      <TreeDropTarget folderPath="">Notes root</TreeDropTarget>
      <WorkspaceTree />
    </details>,
  );
  return moveFile;
}
it("폴더·루트 드롭, 대상 강조와 드래그 종료 정리", async () => {
  const moveFile = setup();
  const file = screen.getByRole("button", { name: "a.md" });
  const target = screen.getByText("target").closest("summary")!;
  const source = screen.getByText("source").closest("summary")!;
  const dataTransfer = transfer();
  expect(file).toHaveAttribute("draggable", "true");
  fireEvent.dragStart(file, { dataTransfer });
  expect(dataTransfer.effectAllowed).toBe("move");
  fireEvent.dragOver(target, { dataTransfer });
  expect(target.className).toContain("treeDropTarget");
  fireEvent.drop(target, { dataTransfer });
  await waitFor(() =>
    expect(moveFile).toHaveBeenCalledWith("source/a.md", "target"),
  );
  expect(target.className).not.toContain("treeDropTarget");
  await waitFor(() => expect(target.parentElement).toHaveAttribute("open"));
  fireEvent.dragStart(file, { dataTransfer });
  fireEvent.drop(source, { dataTransfer });
  expect(moveFile).toHaveBeenCalledOnce();
  const root = screen.getByText("Notes root");
  fireEvent.dragOver(root, { dataTransfer });
  fireEvent.dragEnd(file, { dataTransfer });
  expect(root.className).not.toContain("treeDropTarget");
  fireEvent.dragStart(file, { dataTransfer });
  fireEvent.drop(root, { dataTransfer });
  expect(moveFile).toHaveBeenLastCalledWith("source/a.md", "");
});
it("외부 payload·다른 프로젝트·busy·브라우저 모드 이동 차단", () => {
  const moveFile = setup();
  const file = screen.getByRole("button", { name: "a.md" });
  const target = screen.getByText("target").closest("summary")!;
  const dataTransfer = transfer();
  dataTransfer.setData("text/plain", "C:/external.md");
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragStart(file, { dataTransfer });
  dataTransfer.setData("application/x-oxidoc-file", "forged");
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragStart(file, { dataTransfer });
  useWorkspace.setState({ project: { name: "Other", path: "C:/other" } });
  fireEvent.drop(target, { dataTransfer });
  useWorkspace.setState({
    project: { name: "Notes", path: "C:/notes" },
    busy: true,
  });
  fireEvent.drop(target, { dataTransfer });
  useWorkspace.setState({ busy: false, desktop: false });
  fireEvent.drop(target, { dataTransfer });
  expect(moveFile).not.toHaveBeenCalled();
});
