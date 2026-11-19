import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "../settings/i18n";
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH,
  useWorkspace,
} from "../workspace/store";
import styles from "./SidebarResizer.module.css";

const KEY_STEP = 16;
/** Dragging this far past the minimum width closes the sidebar, as in VS Code. */
const COLLAPSE_DISTANCE = 60;
const WIDTH_VARIABLE = "--sidebar-width";
const COLLAPSING_ATTRIBUTE = "data-sidebar-collapsing";

/**
 * Drag handle between the sidebar and the content panel. While dragging it
 * only updates a CSS variable on the workbench; the width is stored once the
 * pointer is released so the session is not saved on every move. Dragging
 * well past the minimum previews and then closes the sidebar, keeping the
 * last width for when it opens again.
 */
export default function SidebarResizer() {
  const width = useWorkspace((state) => state.layout.sidebarWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const commit = (value: number) =>
    useWorkspace
      .getState()
      .setLayout({ sidebarWidth: clampSidebarWidth(value) });
  const workbench = (element: HTMLElement) => element.parentElement;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
    document.body.classList.add(styles.resizing);
  }
  /** The width under the pointer, or `null` when the sidebar would close. */
  function target(event: PointerEvent<HTMLDivElement>) {
    const raw = drag.current!.startWidth + event.clientX - drag.current!.startX;
    return raw < SIDEBAR_WIDTH.min - COLLAPSE_DISTANCE
      ? null
      : clampSidebarWidth(raw);
  }
  function preview(element: HTMLElement, next: number | null) {
    const parent = workbench(element);
    if (!parent) return;
    parent.toggleAttribute(COLLAPSING_ATTRIBUTE, next === null);
    if (next !== null) parent.style.setProperty(WIDTH_VARIABLE, `${next}px`);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) preview(event.currentTarget, target(event));
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (!drag.current) return;
    const next = cancelled ? drag.current.startWidth : target(event);
    const start = drag.current.startWidth;
    drag.current = null;
    setDragging(false);
    document.body.classList.remove(styles.resizing);
    // Match the stored width even when React has nothing new to render.
    preview(event.currentTarget, next ?? start);
    if (next === null) useWorkspace.getState().setLayout({ sidebar: false });
    else commit(next);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const changes: Record<string, number> = {
      ArrowLeft: width - KEY_STEP,
      ArrowRight: width + KEY_STEP,
      Home: SIDEBAR_WIDTH.min,
      End: SIDEBAR_WIDTH.max,
    };
    if (!(event.key in changes)) return;
    event.preventDefault();
    commit(changes[event.key]);
  }

  return (
    <div
      className={`${styles.resizer} ${dragging ? styles.dragging : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("사이드바 너비")}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={width}
      title={t(
        "끌어서 사이드바 너비 조절, 왼쪽 끝까지 끌면 닫기 (더블클릭: 기본값)",
      )}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onDoubleClick={() => commit(SIDEBAR_WIDTH.default)}
      onKeyDown={onKeyDown}
    />
  );
}
