import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore, defaultLayout, isDirty } from "./store";
import type { AdvancedApi, WorkspaceApi } from "./api";

function fixture() {
  const project = { name: "Notes", path: "C:/notes" };
  const other = { name: "Other", path: "C:/other" };
  const entry = { name: "a.md", path: "dir/a.md", isDirectory: false };
  const advanced: AdvancedApi = {
    create: vi.fn().mockResolvedValue(entry),
    moveFile: vi.fn().mockResolvedValue({ ...entry, path: "target/a.md" }),
    rename: vi
      .fn()
      .mockResolvedValue({ name: "new", path: "new", isDirectory: true }),
    trash: vi.fn().mockResolvedValue(undefined),
    pickSave: vi.fn().mockResolvedValue("copy.md"),
    target: vi.fn().mockResolvedValue(null),
    saveAs: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue([project, other]),
    remove: vi.fn().mockResolvedValue([other]),
    relocate: vi.fn().mockResolvedValue(null),
    loadApp: vi.fn().mockResolvedValue({}),
    loadSession: vi.fn().mockResolvedValue({}),
    saveSession: vi.fn().mockResolvedValue(undefined),
    search: vi
      .fn()
      .mockResolvedValue({ matches: [], truncated: false, skipped: 0 }),
    image: vi.fn(),
    external: vi.fn(),
  };
  const api: WorkspaceApi = {
    advanced,
    projects: vi.fn().mockResolvedValue([project, other]),
    pick: vi.fn().mockResolvedValue(null),
    entries: vi.fn().mockResolvedValue([entry]),
    read: vi.fn().mockResolvedValue("# Original"),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return {
    project,
    other,
    entry,
    api,
    advanced,
    store: createWorkspaceStore(api),
  };
}
describe("프로젝트·문서 상태 보존", () => {
  it("초기 로딩 실패 후 수동으로 편집한 작업은 목록 재시도에서 유지", async () => {
    const { store, project, entry, api, advanced } = fixture();
    vi.mocked(api.projects).mockRejectedValueOnce(Error("startup failed"));
    await store.getState().initialize(true);
    expect(store.getState().initialized).toBe(false);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "keep unsaved buffer");
    store.getState().setLayout({ view: "edit", activity: "projects" });
    const before = store.getState();
    await store.getState().initialize(true);
    expect(advanced.loadApp).not.toHaveBeenCalled();
    expect(store.getState().documents).toBe(before.documents);
    expect(store.getState().activeId).toBe(entry.path);
    expect(store.getState().documents[0].content).toBe("keep unsaved buffer");
    expect(store.getState().layout).toBe(before.layout);
    expect(store.getState().project?.path).toBe(project.path);
    expect(store.getState().initialized).toBe(true);
  });
  it("파일 이동 후 미저장 버퍼·활성 탭 보존, 새 경로로 저장 및 세션 복원", async () => {
    const { store, project, entry, api, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "unsaved buffer");
    expect(await store.getState().moveFile(entry.path, "target")).toBe(true);
    expect(advanced.moveFile).toHaveBeenCalledWith(
      project.path,
      entry.path,
      "target",
    );
    expect(store.getState().documents[0]).toMatchObject({
      id: "target/a.md",
      folder: "target",
      content: "unsaved buffer",
      savedContent: "# Original",
    });
    expect(store.getState().activeId).toBe("target/a.md");
    expect(api.entries).toHaveBeenCalledWith(project.path, "target");
    await store.getState().save("target/a.md");
    expect(api.save).toHaveBeenCalledWith(
      project.path,
      "target/a.md",
      "unsaved buffer",
      "# Original",
    );
    await store.getState().persist();
    expect(advanced.saveSession).toHaveBeenLastCalledWith(
      project.path,
      expect.objectContaining({
        paths: ["target/a.md"],
        activeId: "target/a.md",
      }),
      expect.anything(),
    );
  });
  it("파일 이동 실패·같은 폴더·열린 대상 문서는 경로와 버퍼 보존", async () => {
    const { store, project, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "unsaved");
    expect(await store.getState().moveFile(entry.path, "dir")).toBe(false);
    expect(advanced.moveFile).not.toHaveBeenCalled();
    vi.mocked(advanced.moveFile).mockRejectedValueOnce(Error("collision"));
    expect(await store.getState().moveFile(entry.path, "target")).toBe(false);
    expect(store.getState().error).toContain("collision");
    expect(store.getState().documents[0]).toMatchObject({
      id: entry.path,
      content: "unsaved",
    });
    expect(store.getState().busy).toBe(false);
    await store.getState().open({ ...entry, path: "target/a.md" });
    expect(await store.getState().moveFile(entry.path, "target")).toBe(false);
    expect(advanced.moveFile).toHaveBeenCalledOnce();
    expect(store.getState().error).toContain("이미 열려");
  });
  it("Windows 대소문자 별칭 문서 중복 방지와 미저장 저장 대상 보호", async () => {
    const { store, project, entry, api, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    await store.getState().open({ ...entry, path: "DIR/A.MD" });
    expect(store.getState().documents).toHaveLength(1);
    expect(api.read).toHaveBeenCalledOnce();
    expect(store.getState().activeId).toBe(entry.path);
    store.getState().edit(entry.path, "unsaved");
    await store
      .getState()
      .open({ name: "b.md", path: "b.md", isDirectory: false });
    vi.mocked(advanced.pickSave).mockResolvedValueOnce("DIR/A.MD");
    expect(await store.getState().saveAs("b.md")).toBe(false);
    expect(advanced.saveAs).not.toHaveBeenCalled();
    await store.getState().renameEntry("DIR", "new");
    expect(store.getState().documents[0]).toMatchObject({
      id: "new/a.md",
      content: "unsaved",
    });
    await store.getState().trashEntry("NEW");
    expect(store.getState().documents.map((d) => d.id)).toEqual(["b.md"]);
  });
  it("경로 재연결 후 등록 정보와 새 경로의 저장된 작업 상태 복원", async () => {
    const { store, project, other, advanced } = fixture();
    const moved = {
      ...project,
      path: "C:/moved",
      favorite: true,
      tags: ["notes"],
    };
    await store.getState().initialize(true);
    await store.getState().activate(project);
    vi.mocked(advanced.relocate).mockResolvedValueOnce([moved, other]);
    vi.mocked(advanced.update).mockResolvedValue([moved, other]);
    vi.mocked(advanced.loadSession).mockResolvedValueOnce({
      paths: ["a.md"],
      activeId: "a.md",
      layout: { ...defaultLayout, view: "preview" },
    });
    await store.getState().relocateProject(project.path);
    expect(advanced.relocate).toHaveBeenCalledWith(project.path);
    expect(store.getState().project?.path).toBe(moved.path);
    expect(store.getState().projects[0]).toEqual(moved);
    expect(store.getState().activeId).toBe("a.md");
    expect(store.getState().layout.view).toBe("preview");
  });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("프로젝트별 열린 문서·활성 탭·레이아웃 복원 및 버퍼 내용 저장 제외", async () => {
    const { store, project, other, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().setLayout({ view: "preview", outline: true });
    await store.getState().activate(other);
    expect(store.getState().documents).toEqual([]);
    await store.getState().activate(project);
    expect(store.getState().activeId).toBe(entry.path);
    expect(store.getState().layout).toMatchObject({
      view: "preview",
      outline: true,
    });
    expect(advanced.saveSession).toHaveBeenCalledWith(
      project.path,
      {
        paths: [entry.path],
        activeId: entry.path,
        layout: { ...defaultLayout, view: "preview", outline: true },
      },
      expect.anything(),
    );
  });
  it("재실행 시 마지막 프로젝트 복원, 사라진 문서 제외 및 경고", async () => {
    const { store, project, api, advanced } = fixture();
    vi.mocked(advanced.loadApp).mockResolvedValue({
      lastProject: project.path,
    });
    vi.mocked(advanced.loadSession).mockResolvedValue({
      paths: ["ok.md", "gone.md"],
      activeId: "gone.md",
    });
    vi.mocked(api.read).mockImplementation(async (_root, path) => {
      if (path === "gone.md") throw Error("missing");
      return "ok";
    });
    await store.getState().initialize(true);
    expect(store.getState().project?.path).toBe(project.path);
    expect(store.getState().documents.map((d) => d.id)).toEqual(["ok.md"]);
    expect(store.getState().activeId).toBe("ok.md");
    expect(store.getState().error).toContain("gone.md");
  });
  it("접근 불가 마지막 프로젝트는 열지 않고 매니저 표시", async () => {
    const { store, project, api, advanced } = fixture();
    vi.mocked(api.projects).mockResolvedValue([
      { ...project, status: "missing" },
    ]);
    vi.mocked(advanced.loadApp).mockResolvedValue({
      lastProject: project.path,
    });
    await store.getState().initialize(true);
    expect(api.entries).not.toHaveBeenCalled();
    expect(store.getState().layout.activity).toBe("projects");
    expect(store.getState().error).toContain("접근할 수 없습니다");
  });
  it("다른 이름 저장은 원본 쓰기 없이 탭 경로 변경, 저장 중 추가 편집 보존", async () => {
    const { store, project, entry, api, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "sent");
    let finish = () => {};
    vi.mocked(advanced.saveAs).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const saving = store.getState().saveAs(entry.path);
    await vi.waitFor(() => expect(advanced.saveAs).toHaveBeenCalled());
    store.getState().edit(entry.path, "newer");
    finish();
    await saving;
    expect(api.save).not.toHaveBeenCalled();
    expect(store.getState().documents[0]).toMatchObject({
      id: "copy.md",
      savedContent: "sent",
      content: "newer",
    });
    expect(isDirty(store.getState().documents[0])).toBe(true);
  });
  it("다른 이름 저장 취소와 실패 시 기존 수정 내용 유지", async () => {
    const { store, project, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "edited");
    vi.mocked(advanced.pickSave).mockResolvedValueOnce(null);
    expect(await store.getState().saveAs(entry.path)).toBe(false);
    vi.mocked(advanced.saveAs).mockRejectedValueOnce("disk full");
    expect(await store.getState().saveAs(entry.path)).toBe(false);
    expect(store.getState().documents[0]).toMatchObject({
      id: entry.path,
      content: "edited",
      savedContent: "# Original",
    });
  });
  it("폴더 이름 변경 시 하위 탭과 미저장 내용 이동, 휴지통 실패 시 유지", async () => {
    const { store, project, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "edited");
    await store.getState().renameEntry("dir", "new");
    expect(store.getState().documents[0]).toMatchObject({
      id: "new/a.md",
      content: "edited",
      savedContent: "# Original",
    });
    vi.mocked(advanced.trash).mockRejectedValueOnce("access denied");
    await store.getState().trashEntry("new");
    expect(store.getState().documents).toHaveLength(1);
    await store.getState().trashEntry("new");
    expect(store.getState().documents).toHaveLength(0);
  });
  it("목록 제거 시 파일 삭제 API 호출 없음", async () => {
    const { store, project, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().removeProject(project.path);
    expect(advanced.remove).toHaveBeenCalledWith(project.path);
    expect(advanced.trash).not.toHaveBeenCalled();
    expect(store.getState().project).toBeNull();
  });
});
