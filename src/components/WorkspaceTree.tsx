import { t } from "../settings/i18n";
import { FolderIcon, FileIcon } from "./FileIcon";
import Icon from "./Icon";
import { useWorkspace, isDirty } from "../workspace/store";
import styles from "../App.module.css";
import type { Entry } from "../workspace/api";
import TreeDropTarget from "./TreeDropTarget";
import { startFileDrag, endFileDrag } from "../workspace/treeDrag";

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
  const documents = useWorkspace((state) => state.documents);
  const activeId = useWorkspace((state) => state.activeId);
  const busy = useWorkspace((state) => state.busy);
  const open = useWorkspace((state) => state.open);
  const expand = useWorkspace((state) => state.expand);
  const desktop = useWorkspace((state) => state.desktop);
  function manage(entry: Entry, event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
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
  if (!entries.length)
    return (
      <p className={styles.resultCount} style={{ paddingLeft: 16 }}>
        {t("빈 폴더")}
      </p>
    );
  return entries.map((entry) =>
    entry.isDirectory ? (
      <details
        className={styles.folderGroup}
        key={entry.path}
        onToggle={(event) => {
          if (event.target === event.currentTarget && event.currentTarget.open)
            void expand(entry.path);
        }}
      >
        <TreeDropTarget
          folderPath={entry.path}
          style={{ paddingLeft: 17 + depth * 14 }}
          onContextMenu={(event) => manage(entry, event)}
        >
          <Icon name="chevron" size={12} />
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
        <WorkspaceTree
          path={entry.path}
          depth={depth + 1}
          onManage={onManage}
          onOpen={onOpen}
        />
      </details>
    ) : (
      <div
        className={styles.treeItem}
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
