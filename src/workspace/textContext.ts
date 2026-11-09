import type { MenuItem } from "./commands";
import { t } from "../settings/i18n";

export type TextAction = "copy" | "cut" | "paste" | "selectAll";
export function copyText(text: string) {
  if (!navigator.clipboard?.writeText)
    throw Error(t("클립보드를 사용할 수 없습니다."));
  return navigator.clipboard.writeText(text);
}
export async function readClipboard() {
  if (!navigator.clipboard?.readText)
    throw Error(t("클립보드를 사용할 수 없습니다."));
  return navigator.clipboard.readText();
}
export function inputMenu(
  node: HTMLInputElement | HTMLTextAreaElement,
): MenuItem[] {
  const value = node.value,
    start = node.selectionStart ?? 0,
    end = node.selectionEnd ?? start;
  const editable = !node.readOnly && !node.disabled;
  function ensureUnchanged() {
    if (
      !node.isConnected ||
      node.value !== value ||
      node.selectionStart !== start ||
      node.selectionEnd !== end
    )
      throw Error(t("내용이 변경되어 텍스트 작업을 취소했습니다."));
  }
  function replace(text: string) {
    ensureUnchanged();
    if (node.readOnly || node.disabled) return;
    const next = value.slice(0, start) + text + value.slice(end);
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(node, next);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.focus();
    node.setSelectionRange(start + text.length, start + text.length);
  }
  return [
    {
      label: t("잘라내기"),
      icon: "cut",
      allowBusy: true,
      disabled: !editable || start === end,
      run: async () => {
        ensureUnchanged();
        await copyText(value.slice(start, end));
        replace("");
      },
    },
    {
      label: t("복사"),
      icon: "copy",
      allowBusy: true,
      disabled: start === end,
      run: () => copyText(value.slice(start, end)),
    },
    {
      label: t("붙여넣기"),
      icon: "paste",
      allowBusy: true,
      disabled: !editable,
      run: async () => replace(await readClipboard()),
    },
    { type: "separator", id: "text-select" },
    {
      label: t("모두 선택"),
      allowBusy: true,
      disabled: node.disabled,
      run: () => {
        if (node.isConnected) {
          node.focus();
          node.select();
        }
      },
    },
  ];
}
