import type { editor } from "monaco-editor/editor/editor.api.js";
import { workspaceApi } from "./api";
import { sameDocumentPath, useWorkspace } from "./store";
import { t } from "../settings/i18n";

export function relativeAssetPath(document: string, asset: string) {
  const parent = document.split("/").slice(0, -1),
    target = asset.split("/");
  while (parent.length && target.length && parent[0] === target[0]) {
    parent.shift();
    target.shift();
  }
  return [...parent.map(() => ".."), ...target]
    .map((part) =>
      part === ".."
        ? part
        : encodeURIComponent(part).replace(
            /[!'()*]/g,
            (character) =>
              `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
          ),
    )
    .join("/");
}
export async function pasteEditorImage(
  instance: editor.IStandaloneCodeEditor,
  file: Blob,
  root: string,
  documentId: string,
) {
  const state = useWorkspace.getState();
  if (!state.desktop)
    throw Error(t("브라우저 샘플에서는 이미지를 저장할 수 없습니다."));
  if (file.size > 10 * 1024 * 1024)
    throw Error(t("이미지는 10MB 이하만 저장할 수 있습니다."));
  const model = instance.getModel(),
    selections = instance.getSelections();
  if (!model || !selections?.length) return;
  const version = model.getVersionId();
  function valid() {
    const state = useWorkspace.getState(),
      current = instance.getSelections();
    return (
      !model!.isDisposed() &&
      instance.getModel() === model &&
      model!.getVersionId() === version &&
      current?.length === selections!.length &&
      current.every((selection, index) =>
        selection.equalsRange(selections![index]),
      ) &&
      state.project?.path === root &&
      state.activeId !== null &&
      sameDocumentPath(state.activeId, documentId) &&
      !state.busy &&
      !state.recoveryCandidates.length &&
      !state.recoveryError
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  if (!valid()) throw Error(t("내용이 변경되어 텍스트 작업을 취소했습니다."));
  const saved = await workspaceApi.advanced!.pasteImage(root, btoa(binary));
  if (!valid())
    throw Error(
      t(
        "이미지는 {0}에 저장되었지만 문서가 바뀌어 링크를 삽입하지 않았습니다.",
        saved.path,
      ),
    );
  instance.pushUndoStop();
  instance.executeEdits(
    "paste-image",
    selections.map((selection) => ({
      range: selection,
      text: `![image](${relativeAssetPath(documentId, saved.path)})`,
      forceMoveMarkers: true,
    })),
  );
  instance.pushUndoStop();
  await useWorkspace.getState().refresh();
}
