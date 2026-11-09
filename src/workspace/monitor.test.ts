import { afterEach, expect, it, vi } from "vitest";
import { workspaceApi } from "./api";
import { createWorkspaceStore, isDirty } from "./store";
import { startWorkspaceMonitor } from "./monitor";

afterEach(() => vi.useRealTimers());
function fixture() {
  const api = {
    ...workspaceApi,
    read: vi.fn().mockResolvedValue("external"),
    save: vi.fn().mockResolvedValue(undefined),
    entries: vi.fn().mockResolvedValue([]),
    advanced: {
      ...workspaceApi.advanced!,
      probe: vi.fn().mockResolvedValue([
        { path: "a.md", stamp: "v1" },
        { path: "", stamp: "dir1" },
      ]),
    },
  };
  const store = createWorkspaceStore(api);
  store.setState({
    initialized: true,
    desktop: true,
    project: { path: "C:/notes", name: "Notes" },
    tree: { "": [] },
    documents: [
      {
        id: "a.md",
        name: "a.md",
        folder: "",
        content: "my edits",
        savedContent: "before",
      },
    ],
    activeId: "a.md",
  });
  return { api, store };
}
it("외부 변경은 미저장 버퍼 보호·저장 차단, 내 편집 유지 후 새 디스크 기준 저장", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  try {
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().documents[0]).toMatchObject({
      content: "my edits",
      savedContent: "before",
      diskContent: "external",
    });
    expect(await store.getState().save("a.md")).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.read).toHaveBeenCalledTimes(1);
    store.getState().resolveExternal("a.md", false);
    expect(isDirty(store.getState().documents[0])).toBe(true);
    expect(await store.getState().save("a.md")).toBe(true);
    expect(api.save).toHaveBeenCalledWith(
      "C:/notes",
      "a.md",
      "my edits",
      "external",
    );
  } finally {
    stop();
  }
});
it("삭제 파일 버퍼 유지 및 감지 중 프로젝트 전환/종료 뒤 늦은 응답 무시", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  api.read.mockRejectedValueOnce(Error("missing"));
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  await vi.advanceTimersByTimeAsync(3000);
  expect(store.getState().documents[0].diskContent).toBeNull();
  expect(isDirty(store.getState().documents[0])).toBe(true);
  let finish: (value: string) => void = () => {};
  api.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  api.advanced.probe.mockResolvedValueOnce([{ path: "a.md", stamp: "v2" }]);
  await vi.advanceTimersByTimeAsync(3000);
  stop();
  store.setState({
    project: { path: "C:/other", name: "Other" },
    generation: 1,
  });
  finish("late response");
  await Promise.resolve();
  expect(store.getState().documents[0].content).toBe("my edits");
  expect(store.getState().documents[0].diskContent).toBeNull();
});
