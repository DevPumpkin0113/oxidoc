/** Icon names used by the app, mapped to Codicons. */
export const spriteIcons = {
  files: "files",
  document: "file-text",
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
  redo: "redo",
  saveAs: "save-as",
  findReplace: "replace",
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
  paste: "clippy",
  collapse: "collapse-all",
  replace: "replace-all",
  caseSensitive: "case-sensitive",
  wholeWord: "whole-word",
  regex: "regex",
  filter: "filter",
  filterActive: "filter-filled",
} as const;

// Codicons missing from the bundled sprite (dist/codicon.svg), copied from
// @vscode/codicons/src/icons. Icon.test.ts checks that sprite ids exist.
export const pathIcons = {
  ellipsis:
    "M5 8C5 8.55229 4.55228 9 4 9C3.44772 9 3 8.55229 3 8C3 7.44772 3.44772 7 4 7C4.55228 7 5 7.44772 5 8ZM9 8C9 8.55229 8.55229 9 8 9C7.44772 9 7 8.55229 7 8C7 7.44772 7.44772 7 8 7C8.55229 7 9 7.44772 9 8ZM12 9C12.5523 9 13 8.55229 13 8C13 7.44772 12.5523 7 12 7C11.4477 7 11 7.44772 11 8C11 8.55229 11.4477 9 12 9Z",
  warning:
    "M14.831 11.965L9.206 1.714C8.965 1.274 8.503 1 8 1C7.497 1 7.035 1.274 6.794 1.714L1.169 11.965C1.059 12.167 1 12.395 1 12.625C1 13.383 1.617 14 2.375 14H13.625C14.383 14 15 13.383 15 12.625C15 12.395 14.941 12.167 14.831 11.965ZM13.625 13H2.375C2.168 13 2 12.832 2 12.625C2 12.561 2.016 12.5 2.046 12.445L7.671 2.195C7.736 2.075 7.863 2 8 2C8.137 2 8.264 2.075 8.329 2.195L13.954 12.445C13.984 12.501 14 12.561 14 12.625C14 12.832 13.832 13 13.625 13ZM8.75 11.25C8.75 11.664 8.414 12 8 12C7.586 12 7.25 11.664 7.25 11.25C7.25 10.836 7.586 10.5 8 10.5C8.414 10.5 8.75 10.836 8.75 11.25ZM7.5 9V5.5C7.5 5.224 7.724 5 8 5C8.276 5 8.5 5.224 8.5 5.5V9C8.5 9.276 8.276 9.5 8 9.5C7.724 9.5 7.5 9.276 7.5 9Z",
} as const;

export type IconName = keyof typeof spriteIcons | keyof typeof pathIcons;
