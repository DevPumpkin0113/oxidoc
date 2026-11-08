import markdown from "material-icon-theme/icons/markdown.svg?url";
import readme from "material-icon-theme/icons/readme.svg?url";
import file from "material-icon-theme/icons/file.svg?url";
import folder from "material-icon-theme/icons/folder-base.svg?url";
import folderOpen from "material-icon-theme/icons/folder-base-open.svg?url";

export function FileIcon({ name, size = 16 }: { name: string; size?: number }) {
  const filename = name.toLocaleLowerCase();
  const source =
    filename === "readme.md"
      ? readme
      : /\.(md|markdown)$/.test(filename)
        ? markdown
        : file;
  return (
    <img
      src={source}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ flexShrink: 0 }}
    />
  );
}

export function FolderIcon({ size = 16 }: { size?: number }) {
  return (
    <span
      data-folder-icon
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <img
        data-folder-state="closed"
        src={folder}
        width={size}
        height={size}
        alt=""
        draggable={false}
      />
      <img
        data-folder-state="open"
        src={folderOpen}
        width={size}
        height={size}
        alt=""
        draggable={false}
      />
    </span>
  );
}
