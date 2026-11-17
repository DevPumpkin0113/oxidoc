import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type WheelEvent,
} from "react";
import { t } from "../settings/i18n";
import { useWorkspace } from "../workspace/store";
import {
  useDocumentSummaries,
  type DocumentSummary,
} from "../workspace/selectors";
import {
  closeDocuments,
  openDocument,
  setSettingsOpen,
} from "../workbench/actions";
import { manageTab } from "../workbench/menus";
import { openPalette } from "../workbench/paletteCommands";
import { dropIndex, tabHints, TAB_DRAG_TYPE } from "../workbench/tabs";
import { useUi } from "../workbench/uiStore";
import { FileIcon } from "./FileIcon";
import Icon from "./Icon";
import Titlebar from "./Titlebar";
import styles from "./TabBar.module.css";

/** Mouse button number of the middle (wheel) button. */
const MIDDLE_BUTTON = 1;

interface DropMark {
  id: string;
  after: boolean;
}

const isTabDrag = (event: DragEvent) =>
  Array.from(event.dataTransfer.types).includes(TAB_DRAG_TYPE);

function closeTab(id: string) {
  if (!useWorkspace.getState().busy) void closeDocuments([id]);
}

function DocumentTab({
  document,
  active,
  hint,
  dragging,
  mark,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  register,
}: {
  document: DocumentSummary;
  active: boolean;
  hint?: string;
  dragging: boolean;
  mark?: "before" | "after";
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
  register: (element: HTMLDivElement | null) => void;
}) {
  const path = document.folder
    ? `${document.folder}/${document.name}`
    : document.name;
  const classes = [
    styles.tab,
    active ? styles.activeTab : "",
    dragging ? styles.draggingTab : "",
    mark === "before" ? styles.dropBefore : "",
    mark === "after" ? styles.dropAfter : "",
  ];
  return (
    <div
      ref={register}
      className={classes.filter(Boolean).join(" ")}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={(event) => {
        // Keep the browser's middle-button autoscroll from starting.
        if (event.button === MIDDLE_BUTTON) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== MIDDLE_BUTTON) return;
        event.preventDefault();
        closeTab(document.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.querySelector<HTMLElement>('[role="tab"]')?.focus();
        manageTab(document.id, event.clientX, event.clientY);
      }}
    >
      <button
        role="tab"
        aria-selected={active}
        aria-controls="document-panel"
        id={`tab-${document.id}`}
        title={path}
        onClick={() => openDocument(document.id)}
      >
        <FileIcon name={document.name} size={16} />
        <span className={styles.tabName}>{document.name}</span>
        {hint ? <span className={styles.tabHint}>{hint}</span> : null}
      </button>
      <button
        className={styles.tabClose}
        aria-label={t("{0} 탭 닫기", document.name)}
        onClick={() => closeTab(document.id)}
      >
        {document.dirty ? (
          <span className={styles.tabDirty}>●</span>
        ) : (
          <Icon name="close" size={13} />
        )}
      </button>
    </div>
  );
}

export default function TabBar() {
  const documents = useDocumentSummaries();
  const activeId = useWorkspace((state) => state.activeId);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const hints = useMemo(() => tabHints(documents), [documents]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [mark, setMark] = useState<DropMark | null>(null);
  const tabs = useRef(new Map<string, HTMLDivElement>());

  // Keep the active tab visible when it changes or opens past the edge.
  useEffect(() => {
    if (!activeId || settingsOpen) return;
    tabs.current
      .get(activeId)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId, settingsOpen, documents.length]);

  function endDrag() {
    setDragged(null);
    setMark(null);
  }
  function drop(target: string | null, after: boolean) {
    const ids = documents.map((document) => document.id);
    if (dragged && dragged !== target)
      useWorkspace
        .getState()
        .moveDocument(
          dragged,
          target === null ? ids.length : dropIndex(ids, dragged, target, after),
        );
    endDrag();
  }
  function dragOverTab(event: DragEvent, id: string) {
    if (!isTabDrag(event) || !dragged) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const box = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > box.left + box.width / 2;
    if (mark?.id !== id || mark.after !== after) setMark({ id, after });
  }
  function scrollWithWheel(event: WheelEvent<HTMLDivElement>) {
    // A vertical wheel scrolls the single row of tabs sideways.
    if (event.deltaX === 0 && event.deltaY !== 0)
      event.currentTarget.scrollLeft += event.deltaY;
  }

  return (
    <div className={styles.tabBar}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={t("열린 문서")}
        onWheel={scrollWithWheel}
        onDragOver={(event) => {
          if (!isTabDrag(event) || !dragged) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!isTabDrag(event)) return;
          event.preventDefault();
          drop(null, true);
        }}
      >
        {settingsOpen ? (
          <div className={`${styles.tab} ${styles.activeTab}`}>
            <button
              role="tab"
              aria-selected
              id="settings-tab"
              aria-controls="settings-panel"
            >
              <Icon name="settings" size={15} />
              <span>{t("설정")}</span>
            </button>
            <button
              className={styles.tabClose}
              aria-label={t("설정 탭 닫기")}
              onClick={() => setSettingsOpen(false)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ) : null}
        {documents.map((document) => (
          <DocumentTab
            key={document.id}
            document={document}
            active={!settingsOpen && activeId === document.id}
            hint={hints.get(document.id)}
            dragging={dragged === document.id}
            mark={
              mark?.id === document.id && dragged !== document.id
                ? mark.after
                  ? "after"
                  : "before"
                : undefined
            }
            register={(element) => {
              if (element) tabs.current.set(document.id, element);
              else tabs.current.delete(document.id);
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(TAB_DRAG_TYPE, document.id);
              event.dataTransfer.effectAllowed = "move";
              setDragged(document.id);
            }}
            onDragOver={(event) => dragOverTab(event, document.id)}
            onDrop={(event) => {
              if (!isTabDrag(event)) return;
              event.preventDefault();
              event.stopPropagation();
              const box = event.currentTarget.getBoundingClientRect();
              drop(document.id, event.clientX > box.left + box.width / 2);
            }}
            onDragEnd={endDrag}
          />
        ))}
      </div>
      <button
        className={styles.paletteButton}
        title={t("명령 팔레트 (Ctrl Shift P)")}
        aria-label={t("명령 팔레트")}
        onClick={openPalette}
      >
        <Icon name="more" size={15} />
      </button>
      <Titlebar />
    </div>
  );
}
