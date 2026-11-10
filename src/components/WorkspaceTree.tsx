import { t } from "../settings/i18n";
import { useState } from "react";
import { visibleEntries } from "../workspace/documentTypes";
import { FolderIcon, FileIcon } from "./FileIcon";
import Icon from "./Icon";
import { useWorkspace, isDirty } from "../workspace/store";
import styles from "../App.module.css";
import type { Entry } from "../workspace/api";
import TreeDropTarget from "./TreeDropTarget";
import { startFileDrag, endFileDrag } from "../workspace/treeDrag";

function FolderRow({
  entry,
  depth,
  className,
  manage,
  onManage,
  onOpen,
}: {
  entry: Entry;
  depth: number;
  className: string;
  manage: (entry: Entry, event: React.MouseEvent<HTMLElement>) => void;
  onManage?: (entry: Entry, x: number, y: number) => void;
  onOpen?: () => void;
}) {
  const children = useWorkspace((state) => state.tree[entry.path]);
  const expand = useWorkspace((state) => state.expand);
  const desktop = useWorkspace((state) => state.desktop);
  const busy = useWorkspace((state) => state.busy);
  const [opened, setOpened] = useState(false);
  const empty = children ? children.length === 0 : entry.hasChildren === false;
  const header = (
    <TreeDropTarget
      as={empty ? "div" : "summary"}
      folderPath={entry.path}
      data-tree-path={entry.path}
      className={`${className} ${empty ? styles.emptyFolder : ""}`}
      style={{ paddingLeft: 17 + depth * 14 }}
      tabIndex={empty ? 0 : undefined}
      onMoved={() => setOpened(true)}
      onContextMenu={(event) => manage(entry, event)}
    >
      {empty ? (
        <span className={styles.chevronSpace} aria-hidden="true" />
      ) : (
        <Icon name="chevron" size={12} />
      )}
      <FolderIcon />
      <span>{entry.name}</span>
      {desktop ? (
        <button
          className={styles.treeAction}
          aria-label={t("{0} 관리", entry.name)}
          disabled={busy}
          onClick={(event) => manage(entry, event)}
        >
          <Icon name="more" size={13} />
        </button>
      ) : null}
    </TreeDropTarget>
  );
  return empty ? (
    <div className={styles.folderGroup}>{header}</div>
  ) : (
    <details
      className={styles.folderGroup}
      open={opened}
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        setOpened(event.currentTarget.open);
        if (event.currentTarget.open) void expand(entry.path);
      }}
    >
      {header}
      <WorkspaceTree
        path={entry.path}
        depth={depth + 1}
        onManage={onManage}
        onOpen={onOpen}
      />
    </details>
  );
}

export default function WorkspaceTree({
  path = "",
  depth = 0,
  onManage,
  onOpen,
}: {
  path?: string;
  depth?: number;
  onOpen?: () => void;
  onManage?: (entry: Entry, x: number, y: number) => void;
}) {
  const entries = useWorkspace((state) => state.tree[path]);
  const tree = useWorkspace((state) => state.tree);
  const view = useWorkspace((state) => state.layout.explorerView);
  const documents = useWorkspace((state) => state.documents);
  const activeId = useWorkspace((state) => state.activeId);
  const busy = useWorkspace((state) => state.busy);
  const open = useWorkspace((state) => state.open);
  const desktop = useWorkspace((state) => state.desktop);
  const clipboard = useWorkspace((state) => state.clipboard);
  const projectPath = useWorkspace((state) => state.project?.path);
  const cutClass = (entry: Entry) =>
    clipboard?.cut &&
    clipboard.root === projectPath &&
    clipboard.entry.path === entry.path
      ? styles.cutEntry
      : "";
  function manage(entry: Entry, event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    (target.matches("button,summary")
      ? target
      : target.querySelector<HTMLElement>("button")
    )?.focus();
    const rect = event.currentTarget.getBoundingClientRect();
    onManage?.(
      entry,
      event.type === "contextmenu" ? event.clientX : rect.right,
      event.type === "contextmenu" ? event.clientY : rect.bottom,
    );
  }
  if (!entries)
    return (
      <p className={styles.resultCount} style={{ paddingLeft: 16 }}>
        {t("불러오는 중…")}
      </p>
    );
  return visibleEntries(entries, tree, view).map((entry) =>
    entry.isDirectory ? (
      <FolderRow
        key={entry.path}
        entry={entry}
        depth={depth}
        className={cutClass(entry)}
        manage={manage}
        onManage={onManage}
        onOpen={onOpen}
      />
    ) : (
      <div
        className={`${styles.treeItem} ${cutClass(entry)}`}
        data-tree-path={entry.path}
        key={entry.path}
        onContextMenu={(event) => manage(entry, event)}
      >
        <button
          className={`${styles.file} ${activeId === entry.path ? styles.selectedFile : ""}`}
          style={{ paddingLeft: 24 + depth * 14 }}
          disabled={busy}
          title={entry.path}
          draggable={desktop && !busy}
          onDragStart={(event) => startFileDrag(event, entry)}
          onDragEnd={endFileDrag}
          onClick={() => {
            onOpen?.();
            void open(entry);
          }}
          aria-current={activeId === entry.path ? "page" : undefined}
        >
          <FileIcon name={entry.name} />
          <span>{entry.name}</span>
          {documents.some(
            (document) => document.id === entry.path && isDirty(document),
          ) ? (
            <span className={styles.dirtyDot} aria-label={t("변경 있음")}>
              ●
            </span>
          ) : null}
        </button>
        {desktop ? (
          <button
            className={styles.treeAction}
            aria-label={t("{0} 관리", entry.name)}
            disabled={busy}
            onClick={(event) => manage(entry, event)}
          >
            <Icon name="more" size={13} />
          </button>
        ) : null}
      </div>
    ),
  );
}
