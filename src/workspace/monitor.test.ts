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
it("숨긴 미확장 폴더에 파일 추가 시 메타데이터 갱신", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  const refresh = vi.fn().mockResolvedValue(undefined);
  store.setState({
    tree: {
      "": [
        {
          name: "hidden",
          path: "hidden",
          isDirectory: true,
          hasDocuments: false,
          hasChildren: false,
        },
      ],
    },
    refresh,
  });
  api.advanced.probe
    .mockResolvedValueOnce([{ path: "hidden", stamp: "v1" }])
    .mockResolvedValueOnce([{ path: "hidden", stamp: "v2" }]);
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  try {
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.advanced.probe).toHaveBeenCalledWith(
      "C:/notes",
      expect.arrayContaining(["hidden"]),
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
});
it("상위 mtime이 그대로인 숨김 폴더의 깊은 문서 추가도 재확인", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  const hidden = {
    path: "assets",
    name: "assets",
    isDirectory: true,
    hasDocuments: false,
    hasChildren: true,
  };
  store.setState({ tree: { "": [hidden] } });
  api.advanced.probe.mockResolvedValue([
    { path: "", stamp: "unchanged" },
    { path: "assets", stamp: "unchanged" },
  ]);
  api.entries
    .mockResolvedValueOnce([hidden])
    .mockResolvedValue([{ ...hidden, hasDocuments: true }]);
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  try {
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().tree[""][0].hasDocuments).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().tree[""][0].hasDocuments).toBe(true);
  } finally {
    stop();
  }
});
it("이미 표시된 부모 내부의 숨김 자손도 각 로드된 가지 재확인", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  const docs = {
    path: "docs",
    name: "docs",
    isDirectory: true,
    hasChildren: true,
    hasDocuments: true,
  };
  const hidden = {
    path: "docs/assets",
    name: "assets",
    isDirectory: true,
    hasChildren: true,
    hasDocuments: false,
  };
  store.setState({ tree: { "": [docs], docs: [hidden] } });
  api.advanced.probe.mockResolvedValue([
    { path: "", stamp: "same" },
    { path: "docs", stamp: "same" },
    { path: "docs/assets", stamp: "same" },
  ]);
  let added = false;
  api.entries.mockImplementation(async (_root, path) =>
    path === "" ? [docs] : [{ ...hidden, hasDocuments: added }],
  );
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  try {
    await vi.advanceTimersByTimeAsync(3000);
    added = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().tree.docs[0].hasDocuments).toBe(true);
  } finally {
    stop();
  }
});
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

it("미편집 문서 외부 변경 자동 반영 및 변경 표시 제거", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  store.setState({
    documents: [{ ...store.getState().documents[0], content: "before" }],
  });
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  try {
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().documents[0]).toMatchObject({
      content: "external",
      savedContent: "external",
      diskContent: undefined,
    });
    expect(isDirty(store.getState().documents[0])).toBe(false);
  } finally {
    stop();
  }
});

it("외부 읽기 대기 중 시작한 편집 보호", async () => {
  vi.useFakeTimers();
  const { api, store } = fixture();
  store.setState({
    documents: [{ ...store.getState().documents[0], content: "before" }],
  });
  let finish!: (value: string) => void;
  api.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const stop = startWorkspaceMonitor("C:/notes", store, api);
  try {
    await vi.advanceTimersByTimeAsync(3000);
    store.getState().edit("a.md", "typing now");
    finish("external");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().documents[0]).toMatchObject({
      content: "typing now",
      savedContent: "before",
      diskContent: "external",
    });
  } finally {
    stop();
  }
});
