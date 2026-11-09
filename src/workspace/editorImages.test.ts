import { afterEach, expect, it, vi } from "vitest";
import type { editor } from "monaco-editor/editor/editor.api.js";
import { workspaceApi } from "./api";
import { useWorkspace } from "./store";
import { pasteEditorImage, relativeAssetPath } from "./editorImages";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  let version = 1;
  const selection = { equalsRange: () => true };
  const model = { isDisposed: () => false, getVersionId: () => version };
  const instance = {
    getModel: () => model,
    getSelections: () => [selection],
    pushUndoStop: vi.fn(),
    executeEdits: vi.fn(),
  };
  const blob = {
    size: 3,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  } as Blob;
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      desktop: true,
      project: { name: "Notes", path: "C:/notes" },
      activeId: "docs/a.md",
      refresh: vi.fn().mockResolvedValue(undefined),
    },
    true,
  );
  return {
    instance: instance as unknown as editor.IStandaloneCodeEditor,
    edits: instance.executeEdits,
    blob,
    bump: () => version++,
  };
}
it("이미지 저장 후 문서 상대 경로 삽입 및 실행 취소 경계", async () => {
  const { instance, edits, blob } = fixture();
  const save = vi
    .spyOn(workspaceApi.advanced!, "pasteImage")
    .mockResolvedValue({
      name: "image.png",
      path: "assets/image.png",
      isDirectory: false,
    });
  await pasteEditorImage(instance, blob, "C:/notes", "docs/a.md");
  expect(save).toHaveBeenCalledWith("C:/notes", "AQID");
  expect(edits).toHaveBeenCalledWith("paste-image", [
    expect.objectContaining({ text: "![image](../assets/image.png)" }),
  ]);
  expect(relativeAssetPath("docs/nested/a.md", "assets/a b.png")).toBe(
    "../../assets/a%20b.png",
  );
});
it("저장 실패 및 저장 중 편집 발생 시 문서에 삽입 금지", async () => {
  const { instance, edits, blob, bump } = fixture();
  const save = vi
    .spyOn(workspaceApi.advanced!, "pasteImage")
    .mockRejectedValueOnce(Error("write denied"));
  await expect(
    pasteEditorImage(instance, blob, "C:/notes", "docs/a.md"),
  ).rejects.toThrow("write denied");
  expect(edits).not.toHaveBeenCalled();
  save.mockImplementationOnce(async () => {
    bump();
    return { path: "assets/saved.png", name: "saved.png", isDirectory: false };
  });
  await expect(
    pasteEditorImage(instance, blob, "C:/notes", "docs/a.md"),
  ).rejects.toThrow("assets/saved.png");
  expect(edits).not.toHaveBeenCalled();
});
