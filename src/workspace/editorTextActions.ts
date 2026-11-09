import type { editor } from "monaco-editor/editor/editor.api.js";
import { copyText, readClipboard, type TextAction } from "./textContext";
import { t } from "../settings/i18n";

export async function editorTextAction(
  instance: editor.IStandaloneCodeEditor,
  action: TextAction,
  readOnly: () => boolean,
) {
  const model = instance.getModel(),
    selections = instance.getSelections();
  if (!model || !selections?.length) return;
  if (action === "selectAll") {
    instance.setSelection(model.getFullModelRange());
    return;
  }
  if ((action === "cut" || action === "paste") && readOnly()) return;
  const version = model.getVersionId();
  function ensureUnchanged() {
    const current = instance.getSelections();
    if (
      model!.isDisposed() ||
      instance.getModel() !== model ||
      model!.getVersionId() !== version ||
      !current ||
      current.length !== selections!.length ||
      current.some((range, index) => {
        const original = selections![index];
        return (
          range.startLineNumber !== original.startLineNumber ||
          range.startColumn !== original.startColumn ||
          range.endLineNumber !== original.endLineNumber ||
          range.endColumn !== original.endColumn
        );
      })
    ) {
      throw Error(t("내용이 변경되어 텍스트 작업을 취소했습니다."));
    }
  }
  let text = "";
  if (action === "copy" || action === "cut") {
    if (selections.every((selection) => selection.isEmpty())) return;
    await copyText(
      selections
        .map((selection) => model.getValueInRange(selection))
        .join(model.getEOL()),
    );
    if (action === "copy") return;
  } else text = await readClipboard();
  ensureUnchanged();
  if (readOnly()) return;
  instance.pushUndoStop();
  const lines = text.split(/\r\n|\r|\n/);
  instance.executeEdits(
    "context-menu",
    selections.map((range, index) => ({
      range,
      text:
        action === "paste" &&
        selections.length > 1 &&
        lines.length === selections.length
          ? lines[index]
          : text,
      forceMoveMarkers: true,
    })),
  );
  instance.pushUndoStop();
}
