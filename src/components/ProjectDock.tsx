import {
  useState,
  type DragEvent,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import { t } from "../settings/i18n";
import type { Project } from "../workspace/api";
import { isDirty, isExternal, useWorkspace } from "../workspace/store";
import {
  activateProject,
  chooseProject,
  closeProjectTab,
} from "../workbench/actions";
import { dropIndex } from "../workbench/tabs";
import Icon from "./Icon";
import styles from "./ProjectDock.module.css";

const DOCK_DRAG_TYPE = "application/x-oxidoc-project";
const isDockDrag = (event: DragEvent) =>
  Array.from(event.dataTransfer.types).includes(DOCK_DRAG_TYPE);
const isAfter = (event: DragEvent) => {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX > box.left + box.width / 2;
};

const tabLabel = (project: Project) =>
  isExternal(project) ? "External" : project.name;
const tabTitle = (project: Project) =>
  isExternal(project)
    ? t("프로젝트 밖에서 연 파일")
    : `${project.path}\n${t("끌거나 Alt+Shift+←/→로 순서 변경")}`;

interface DropMark {
  path: string;
  after: boolean;
}

/**
 * Project tabs inside the status bar; each tab keeps its own documents.
 * Dragging shows an insertion bar like the document tabs.
 */
export default function ProjectDock() {
  const tabs = useWorkspace((state) => state.openProjects);
  const active = useWorkspace((state) => state.project?.path);
  const busy = useWorkspace((state) => state.busy);
  const unsaved = useWorkspace((state) => {
    const paths = Object.values(state.parked)
      .filter((tab) => tab.documents.some(isDirty))
      .map((tab) => tab.project.path);
    if (state.project && state.documents.some(isDirty))
      paths.push(state.project.path);
    return paths.join("\n");
  });
  const [dragged, setDragged] = useState<string | null>(null);
  const [mark, setMark] = useState<DropMark | null>(null);
  const paths = tabs.map((tab) => tab.path);

  function endDrag() {
    setDragged(null);
    setMark(null);
  }
  function drop(target: string | null, after: boolean) {
    if (dragged && dragged !== target)
      useWorkspace
        .getState()
        .moveProject(
          dragged,
          target === null
            ? paths.length
            : dropIndex(paths, dragged, target, after),
        );
    endDrag();
  }
  function onKeyDown(event: KeyboardEvent, index: number, project: Project) {
    if (!event.altKey || !event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    useWorkspace
      .getState()
      .moveProject(project.path, index + (event.key === "ArrowLeft" ? -1 : 1));
  }
  function scrollWithWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaX === 0 && event.deltaY !== 0)
      event.currentTarget.scrollLeft += event.deltaY;
  }

  return (
    <nav className={styles.dock} aria-label={t("열린 프로젝트")}>
      <div
        className={styles.tabs}
        onWheel={scrollWithWheel}
        onDragOver={(event) => {
          if (!isDockDrag(event) || !dragged) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!isDockDrag(event)) return;
          event.preventDefault();
          drop(null, true);
        }}
      >
        {tabs.map((project, index) => {
          const selected = project.path === active;
          const dirty = unsaved.split("\n").includes(project.path);
          const marked =
            mark?.path === project.path && dragged !== project.path
              ? mark.after
                ? styles.dropAfter
                : styles.dropBefore
              : "";
          return (
            <div
              key={project.path}
              className={`${styles.tab} ${selected ? styles.selected : ""} ${dragged === project.path ? styles.dragging : ""} ${marked}`}
              draggable={!busy}
              onDragStart={(event) => {
                event.dataTransfer.setData(DOCK_DRAG_TYPE, project.path);
                event.dataTransfer.effectAllowed = "move";
                setDragged(project.path);
              }}
              onDragOver={(event) => {
                if (!isDockDrag(event) || !dragged) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                const after = isAfter(event);
                if (mark?.path !== project.path || mark.after !== after)
                  setMark({ path: project.path, after });
              }}
              onDrop={(event) => {
                if (!isDockDrag(event)) return;
                event.preventDefault();
                event.stopPropagation();
                drop(project.path, isAfter(event));
              }}
              onDragEnd={endDrag}
              onAuxClick={(event) => {
                if (event.button === 1) void closeProjectTab(project.path);
              }}
            >
              <button
                type="button"
                aria-pressed={selected}
                aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
                title={tabTitle(project)}
                disabled={busy && !selected}
                onClick={() => void activateProject(project)}
                onKeyDown={(event) => onKeyDown(event, index, project)}
              >
                <Icon
                  name={isExternal(project) ? "external" : "projects"}
                  size={12}
                />
                <span className={styles.name}>{tabLabel(project)}</span>
                {dirty ? (
                  <span className={styles.dirty} aria-label={t("저장 안 됨")}>
                    ●
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={styles.close}
                aria-label={t("{0} 닫기", tabLabel(project))}
                disabled={busy}
                onClick={() => void closeProjectTab(project.path)}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.add}
        aria-label={t("프로젝트 탭 추가")}
        title={t("프로젝트 탭 추가")}
        disabled={busy}
        onClick={() => void chooseProject()}
      >
        <Icon name="add" size={13} />
      </button>
    </nav>
  );
}
