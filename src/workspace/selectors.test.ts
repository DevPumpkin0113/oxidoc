import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { useWorkspace } from "./store";
import { useDocumentContent, useDocumentSummaries } from "./selectors";

const document = {
  id: "notes/a.md",
  name: "a.md",
  folder: "notes",
  content: "# A",
  savedContent: "# A",
};

beforeEach(() => {
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useWorkspace.setState({ documents: [document], activeId: document.id });
});

it("요약은 내용만 바뀌면 같은 배열을 유지하고 변경·디스크 상태가 바뀌면 갱신", () => {
  let renders = 0;
  const { result } = renderHook(() => {
    renders += 1;
    return useDocumentSummaries();
  });
  const initial = result.current;
  expect(initial).toEqual([
    { id: "notes/a.md", name: "a.md", folder: "notes", dirty: false },
  ]);

  act(() => useWorkspace.getState().edit(document.id, "# A!"));
  const dirty = result.current;
  expect(dirty[0].dirty).toBe(true);

  const before = renders;
  act(() => useWorkspace.getState().edit(document.id, "# A!!"));
  act(() => useWorkspace.getState().edit(document.id, "# A!!!"));
  expect(renders).toBe(before);
  expect(result.current).toBe(dirty);

  act(() =>
    useWorkspace.setState((state) => ({
      documents: state.documents.map((item) => ({
        ...item,
        diskContent: null,
      })),
    })),
  );
  expect(result.current[0].disk).toBeNull();
});

it("문서 내용 선택자는 해당 문서 내용만 반환", () => {
  const { result } = renderHook(() => useDocumentContent(document.id));
  expect(result.current).toBe("# A");
  act(() => useWorkspace.getState().edit(document.id, "# B"));
  expect(result.current).toBe("# B");
  const missing = renderHook(() => useDocumentContent("missing.md"));
  expect(missing.result.current).toBe("");
});
