import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore, defaultLayout, isDirty } from "./store";
import type { AdvancedApi, WorkspaceApi } from "./api";

function fixture() {
  const project = { name: "Notes", path: "C:/notes" };
  const other = { name: "Other", path: "C:/other" };
  const entry = { name: "a.md", path: "dir/a.md", isDirectory: false };
  const advanced: AdvancedApi = {
    pasteImage: vi.fn(),
    previewReplace: vi
      .fn()
      .mockResolvedValue({ files: [], truncated: false, skipped: 0 }),
    applyReplace: vi.fn().mockResolvedValue([]),
    index: vi
      .fn()
      .mockResolvedValue({ entries: [], truncated: false, skipped: 0 }),
    loadRecovery: vi.fn().mockResolvedValue([]),
    saveRecovery: vi.fn().mockResolvedValue(undefined),
    probe: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(entry),
    moveFile: vi.fn().mockResolvedValue({ ...entry, path: "target/a.md" }),
    transfer: vi.fn().mockResolvedValue({ ...entry, path: "target/a.md" }),
    entryPath: vi.fn().mockResolvedValue("C:/notes/a.md"),
    explorer: vi.fn().mockResolvedValue(undefined),
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
  it("프로젝트 바꾸기는 열린 미저장 문서 차단 및 성공 파일만 열린 모델 갱신", async () => {
    const { store, project, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    const files = [
      { path: entry.path, before: "# Original", after: "# Replaced", count: 1 },
    ];
    store.getState().edit(entry.path, "unsaved");
    await expect(store.getState().applyReplacements(files)).rejects.toThrow(
      "미저장",
    );
    expect(advanced.applyReplace).not.toHaveBeenCalled();
    store.getState().edit(entry.path, "# Original");
    vi.mocked(advanced.applyReplace).mockResolvedValueOnce([
      { path: entry.path, error: null },
    ]);
    await store.getState().applyReplacements(files);
    expect(store.getState().documents[0]).toMatchObject({
      content: "# Replaced",
      savedContent: "# Replaced",
    });
  });
  it("원본 프로젝트 폴더가 없어도 AppData 후보 복구 및 버퍼 보존", async () => {
    const { store, project, api, advanced } = fixture();
    await store.getState().initialize(true);
    vi.mocked(api.entries).mockRejectedValueOnce(Error("root missing"));
    vi.mocked(advanced.loadRecovery).mockResolvedValueOnce([
      { path: "a.md", content: "rescued", savedContent: "before" },
    ]);
    expect(await store.getState().activate(project)).toBe(true);
    expect(store.getState().project?.status).toBe("unavailable");
    vi.mocked(api.read).mockRejectedValueOnce(Error("root missing"));
    await store.getState().decideRecovery(true);
    expect(store.getState().documents[0]).toMatchObject({
      content: "rescued",
      diskContent: null,
    });
  });
  it("복구 후보가 있는 프로젝트 재연결 후 이전 등록 경로에 쓰지 않고 새 후보 유지", async () => {
    const { store, project, other, advanced } = fixture();
    let registeredRoot = project.path;
    const relocated = { ...project, path: "C:/relocated" };
    vi.mocked(advanced.loadRecovery).mockResolvedValue([
      { path: "a.md", content: "backup", savedContent: "before" },
    ]);
    vi.mocked(advanced.saveRecovery).mockImplementation(async (root) => {
      if (root !== registeredRoot) throw Error("unregistered root");
    });
    vi.mocked(advanced.relocate).mockImplementation(async () => {
      registeredRoot = relocated.path;
      return [relocated, other];
    });
    await store.getState().initialize(true);
    await store.getState().activate(project);
    vi.mocked(advanced.update).mockResolvedValue([relocated, other]);
    await store.getState().relocateProject(project.path);
    expect(store.getState().project?.path).toBe(relocated.path);
    expect(store.getState().recoveryCandidates[0].content).toBe("backup");
    expect(store.getState().error).toBe("");
  });
  it("미저장 임시본은 원본 쓰기 없이 재시작 복구, 외부 변경 충돌 보존 및 폐기 정리", async () => {
    const { store, project, entry, api, advanced } = fixture();
    let backups: { path: string; content: string; savedContent: string }[] = [];
    vi.mocked(advanced.saveRecovery).mockImplementation(
      async (_root, documents) => {
        backups = structuredClone(documents);
      },
    );
    vi.mocked(advanced.loadRecovery).mockImplementation(async () =>
      structuredClone(backups),
    );
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "crash buffer");
    await vi.advanceTimersByTimeAsync(750);
    expect(backups[0].content).toBe("crash buffer");
    expect(api.save).not.toHaveBeenCalled();
    const restarted = createWorkspaceStore(api);
    await restarted.getState().initialize(true);
    await restarted.getState().activate(project);
    expect(restarted.getState().recoveryCandidates[0].content).toBe(
      "crash buffer",
    );
    vi.mocked(api.read).mockResolvedValueOnce("externally changed");
    await restarted.getState().decideRecovery(true);
    expect(restarted.getState().documents[0]).toMatchObject({
      content: "crash buffer",
      savedContent: "# Original",
      diskContent: "externally changed",
    });
    expect(await restarted.getState().save(entry.path)).toBe(false);
    restarted.getState().close(entry.path);
    await vi.advanceTimersByTimeAsync(750);
    expect(backups).toEqual([]);
  });
  it("복구본 읽기 실패 시 자동 덮어쓰기 금지·명시적 폐기 후 정상 편집", async () => {
    const { store, project, advanced } = fixture();
    vi.mocked(advanced.loadRecovery).mockRejectedValueOnce(
      Error("invalid recovery"),
    );
    await store.getState().initialize(true);
    expect(await store.getState().activate(project)).toBe(true);
    expect(store.getState().recoveryReady).toBe(false);
    expect(store.getState().recoveryError).toContain("invalid recovery");
    await vi.advanceTimersByTimeAsync(1500);
    expect(advanced.saveRecovery).not.toHaveBeenCalled();
    await store.getState().decideRecovery(false);
    expect(advanced.saveRecovery).toHaveBeenCalledWith(project.path, []);
    expect(store.getState().recoveryReady).toBe(true);
  });
  it("외부 삭제 문서를 기본 이름으로 저장하면 덮어쓰기 없이 재생성하고 탭 유지", async () => {
    const { store, project, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "recover my buffer");
    store.getState().noticeExternal(entry.path, null);
    vi.mocked(advanced.pickSave).mockResolvedValueOnce(entry.path);
    expect(await store.getState().saveAs(entry.path)).toBe(true);
    expect(advanced.saveAs).toHaveBeenCalledWith(
      project.path,
      entry.path,
      "recover my buffer",
      null,
    );
    expect(store.getState().documents).toHaveLength(1);
    expect(store.getState().documents[0]).toMatchObject({
      id: entry.path,
      content: "recover my buffer",
      savedContent: "recover my buffer",
    });
    expect(isDirty(store.getState().documents[0])).toBe(false);
  });
  it("닫은 탭 복원은 디스크 원본 재열기·프로젝트별 분리·중복 방지", async () => {
    const { store, project, other, entry, api } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "discarded");
    store.getState().close(entry.path);
    await store.getState().activate(other);
    await store.getState().reopenClosed();
    expect(store.getState().documents).toHaveLength(0);
    await store.getState().activate(project);
    await store.getState().reopenClosed();
    expect(store.getState().documents[0].content).toBe("# Original");
    expect(isDirty(store.getState().documents[0])).toBe(false);
    await store.getState().reopenClosed();
    expect(store.getState().documents).toHaveLength(1);
    store.getState().close(entry.path);
    vi.mocked(api.read).mockRejectedValueOnce(Error("missing file"));
    await store.getState().reopenClosed();
    expect(store.getState().error).toContain("missing file");
    expect(store.getState().documents).toHaveLength(0);
  });
  it("폴더 잘라내기 후 하위 문서 경로·미저장 내용 유지, 실패 시 클립보드 유지", async () => {
    const { store, project, entry, advanced } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "unsaved");
    const folder = { name: "dir", path: "dir", isDirectory: true };
    store.setState({ tree: { "": [folder], dir: [entry] } });
    store.getState().copyEntry(folder, true);
    vi.mocked(advanced.transfer).mockRejectedValueOnce(Error("conflict"));
    expect(await store.getState().pasteEntry("target")).toBe(false);
    expect(store.getState().clipboard?.cut).toBe(true);
    expect(store.getState().documents[0].id).toBe("dir/a.md");
    vi.mocked(advanced.transfer).mockResolvedValueOnce({
      name: "dir",
      path: "target/dir",
      isDirectory: true,
    });
    expect(await store.getState().pasteEntry("target")).toBe(true);
    expect(store.getState().clipboard).toBeNull();
    expect(store.getState().documents[0]).toMatchObject({
      id: "target/dir/a.md",
      content: "unsaved",
      savedContent: "# Original",
    });
    expect(store.getState().activeId).toBe("target/dir/a.md");
  });
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
