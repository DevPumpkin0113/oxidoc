import { describe, expect, it, vi } from "vitest";
import { createWorkspaceStore, isDirty } from "./store";
import type { WorkspaceApi } from "./api";

function fixture() {
  const project = { name: "Notes", path: "C:/notes" };
  const entry = { name: "readme.md", path: "readme.md", isDirectory: false };
  const api: WorkspaceApi = {
    projects: vi.fn().mockResolvedValue([project]),
    pick: vi.fn().mockResolvedValue(project),
    entries: vi.fn().mockResolvedValue([entry]),
    read: vi.fn().mockResolvedValue("# Before"),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return { project, entry, api, store: createWorkspaceStore(api) };
}

describe("실제 작업 공간 상태", () => {
  it("등록 목록 로드, 폴더 열기, 같은 문서 중복 열기 방지", async () => {
    const { store, project, entry, api } = fixture();
    await store.getState().initialize(true);
    expect(store.getState().projects).toEqual([project]);
    expect(store.getState().documents).toEqual([]);
    await store.getState().activate(project);
    await store.getState().open(entry);
    await store.getState().open(entry);
    expect(api.read).toHaveBeenCalledOnce();
    expect(store.getState().documents).toHaveLength(1);
    expect(store.getState().tree[""]).toEqual([entry]);
  });
  it("저장 실패 시 변경 내용·수정 상태 보존", async () => {
    const { store, project, entry, api } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "# Edited");
    vi.mocked(api.save).mockRejectedValueOnce(
      "파일이 외부에서 변경되었습니다.",
    );
    expect(await store.getState().save(entry.path)).toBe(false);
    expect(store.getState().documents[0].content).toBe("# Edited");
    expect(isDirty(store.getState().documents[0])).toBe(true);
    expect(store.getState().error).toContain("외부에서 변경");
  });
  it("저장 중 새로운 편집 내용은 미저장 상태 유지", async () => {
    const { store, project, entry, api } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    store.getState().edit(entry.path, "# Sent");
    let finish: () => void = () => {};
    vi.mocked(api.save).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const saving = store.getState().save(entry.path);
    store.getState().edit(entry.path, "# Newer");
    finish();
    await saving;
    expect(store.getState().documents[0]).toMatchObject({
      content: "# Newer",
      savedContent: "# Sent",
    });
    expect(api.save).toHaveBeenCalledWith(
      project.path,
      entry.path,
      "# Sent",
      "# Before",
    );
  });
  it("접근 불가 프로젝트 전환 시 현재 문서 보존", async () => {
    const { store, project, entry, api } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    await store.getState().open(entry);
    vi.mocked(api.entries).mockRejectedValueOnce("접근 불가");
    expect(
      await store.getState().activate({ name: "Missing", path: "C:/missing" }),
    ).toBe(false);
    expect(store.getState().project).toEqual(project);
    expect(store.getState().documents[0].id).toBe(entry.path);
  });
  it("폴더 선택 취소 시 기존 작업 공간 유지", async () => {
    const { store, project, api } = fixture();
    await store.getState().initialize(true);
    await store.getState().activate(project);
    vi.mocked(api.pick).mockResolvedValueOnce(null);
    expect(await store.getState().choose()).toBeNull();
    expect(store.getState().project).toEqual(project);
  });
});
