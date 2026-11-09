import type { CSSProperties } from "react";
import sprite from "@vscode/codicons/dist/codicon.svg?url";

const icons = {
  files: "files",
  search: "search",
  projects: "project",
  settings: "settings-gear",
  chevron: "chevron-right",
  down: "chevron-down",
  close: "close",
  minus: "chrome-minimize",
  maximize: "chrome-maximize",
  restore: "chrome-restore",
  panel: "layout-sidebar-left",
  split: "split-horizontal",
  code: "code",
  preview: "open-preview",
  markdown: "markdown",
  folder: "folder",
  book: "library",
  check: "check",
  save: "save",
  star: "star-full",
  starFilled: "star-full",
  add: "add",
  refresh: "refresh",
  undo: "discard",
  outline: "list-tree",
  sync: "link",
  bell: "bell",
  branch: "git-branch",
  dot: "circle-filled",
  more: "kebab-vertical",
  rename: "edit",
  trash: "trash",
  tag: "tag",
  external: "link-external",
  copy: "copy",
  cut: "cut",
  paste: "paste",
  collapse: "collapse-all",
} as const;

export type IconName = keyof typeof icons;

export default function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <use href={`${sprite}#${icons[name]}`} />
    </svg>
  );
}
