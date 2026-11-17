import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, type Document } from "../workspace/store";
import { confirmDocuments, resolveConfirmation } from "./dialogs";
import { handleKeydown } from "./globalEvents";
import { manageTab } from "./menus";
import { buildPaletteCommands, openPalette } from "./paletteCommands";
import { useUi } from "./uiStore";

const document = (id: string, content = "# A"): Document => ({
  id,
  name: id.split("/").pop()!,
  folder: "",
  content,
  savedContent: "# A",
});
const project = { name: "Notes", path: "C:/notes" };

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
});

describe("팔레트 명령", () => {
  it("열린 문서가 있을 때만 문서 명령을 만들고 실행 시 팔레트를 닫음", () => {
    useWorkspace.setState({ project, desktop: true });
    const ids = () => buildPaletteCommands().map((command) => command.id);
    expect(ids()).not.toContain("save");
    expect(ids()).toContain("new-file");

    const save = vi.fn().mockResolvedValue(true);
    useWorkspace.setState({
      documents: [document("a.md")],
      activeId: "a.md",
      save,
    });
    expect(ids()).toEqual(
      expect.arrayContaining(["save", "find", "outline", "document-0"]),
    );
    openPalette();
    expect(useUi.getState().palette).toBe(true);
    void buildPaletteCommands()
      .find((command) => command.id === "save")!
      .run();
    expect(useUi.getState().palette).toBe(false);
    expect(save).toHaveBeenCalledWith("a.md");
  });

  it("설정 탭이 열려 있으면 현재 탭 닫기가 설정 탭을 닫음", () => {
    useUi.setState({ settingsOpen: true });
    const close = buildPaletteCommands().find(
      (command) => command.id === "close-tab",
    )!;
    expect(close.enabled?.()).toBe(true);
    void close.run();
    expect(useUi.getState().settingsOpen).toBe(false);
  });
});

describe("탭 메뉴", () => {
  it("탭이 하나면 다른 탭·오른쪽 탭 닫기 비활성", () => {
    useWorkspace.setState({
      project,
      documents: [document("a.md")],
      activeId: "a.md",
    });
    manageTab("a.md", 10, 20);
    const menu = useUi.getState().menu!;
    expect(menu).toMatchObject({ title: "a.md", x: 10, y: 20 });
    const disabled = menu.items
      .filter((item) => item.type !== "separator" && item.disabled)
      .map((item) => (item.type === "separator" ? "" : item.label));
    expect(disabled).toEqual(
      expect.arrayContaining(["다른 탭 닫기", "오른쪽 탭 닫기", "모두 저장"]),
    );
  });
});

describe("미저장 확인", () => {
  it("동시 요청은 한 번만 묻고, 취소하면 false, 저장 안 함이면 true", async () => {
    const dirty = document("a.md", "# Edited");
    const first = confirmDocuments([dirty]);
    const second = confirmDocuments([dirty]);
    expect(useUi.getState().confirmation?.names).toEqual(["a.md"]);
    resolveConfirmation("cancel");
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(useUi.getState().confirmation).toBeNull();

    const discard = confirmDocuments([dirty]);
    resolveConfirmation("discard");
    await expect(discard).resolves.toBe(true);
    await expect(confirmDocuments([document("b.md")])).resolves.toBe(true);
  });
});

describe("전역 단축키", () => {
  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
    handleKeydown(event);
    return event;
  };

  it("Ctrl B 사이드바 전환, Esc 개요 닫기, 모달이 열려 있으면 무시", () => {
    expect(useWorkspace.getState().layout.sidebar).toBe(true);
    expect(press({ key: "b", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(useWorkspace.getState().layout.sidebar).toBe(false);

    useWorkspace.getState().setLayout({ outline: true });
    press({ key: "Escape" });
    expect(useWorkspace.getState().layout.outline).toBe(false);

    useUi.setState({ quickOpen: true });
    expect(press({ key: "b", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(useWorkspace.getState().layout.sidebar).toBe(false);
  });

  it("Ctrl P는 프로젝트가 없으면 팔레트, 있으면 빠른 열기", () => {
    press({ key: "p", ctrlKey: true });
    expect(useUi.getState().palette).toBe(true);
    useUi.setState({ palette: false });
    useWorkspace.setState({ project });
    press({ key: "p", ctrlKey: true });
    expect(useUi.getState().quickOpen).toBe(true);
  });
});
