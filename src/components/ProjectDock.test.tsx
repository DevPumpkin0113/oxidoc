import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ProjectDock from "./ProjectDock";
import type { Project } from "../workspace/api";
import { EXTERNAL_PROJECT, useWorkspace } from "../workspace/store";

const notes: Project = { name: "Notes", path: "C:/notes" };
const work: Project = { name: "Work", path: "C:/work" };

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
  useWorkspace.getState().openProjects.map((project) => project.path);
const tab = (name: string) =>
  screen.getByRole("button", { name }).parentElement!;

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useWorkspace.setState({
    desktop: true,
    project: notes,
    openProjects: [notes, work, EXTERNAL_PROJECT],
  });
});

it("열린 프로젝트와 External을 탭으로 표시하고 현재 탭을 선택 상태로 표시", () => {
  render(<ProjectDock />);
  expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "External" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("탭을 끌면 놓일 위치에 막대를 표시하고 놓으면 순서가 바뀜", () => {
  render(<ProjectDock />);
  const dragged = tab("Notes");
  const target = tab("External");
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    left: 100,
    width: 100,
  } as DOMRect);
  const dataTransfer = transfer();
  // jsdom has no DragEvent, so pointer coordinates are set on the event.
  const at = (event: Event, x: number) => {
    Object.defineProperty(event, "clientX", { value: x });
    return event;
  };
  fireEvent.dragStart(dragged, { dataTransfer });
  expect(dragged.className).toContain("dragging");
  fireEvent(target, at(createEvent.dragOver(target, { dataTransfer }), 120));
  expect(target.className).toContain("dropBefore");
  fireEvent(target, at(createEvent.dragOver(target, { dataTransfer }), 180));
  expect(target.className).toContain("dropAfter");
  fireEvent(target, at(createEvent.drop(target, { dataTransfer }), 180));
  expect(order()).toEqual([work.path, EXTERNAL_PROJECT.path, notes.path]);
  expect(target.className).not.toContain("dropAfter");
});

it("Alt+Shift+방향키로 탭 순서 변경", () => {
  render(<ProjectDock />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Work" }), {
    key: "ArrowLeft",
    altKey: true,
    shiftKey: true,
  });
  expect(order()).toEqual([work.path, notes.path, EXTERNAL_PROJECT.path]);
});
