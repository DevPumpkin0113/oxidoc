import {
  createElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type UIEvent,
} from "react";
import styles from "./ScrollArea.module.css";

/** Smallest thumb length so a long document still has something to grab. */
const MIN_THUMB = 24;
/** How long the bar stays after scrolling stops. */
const HIDE_DELAY_MS = 900;

type Axis = "x" | "y";
type Bar = { start: number; size: number; visible: boolean };
const hidden: Bar = { start: 0, size: 0, visible: false };

function measure(element: HTMLElement, axis: Axis): Bar {
  const [offset, total, visible] =
    axis === "y"
      ? [element.scrollTop, element.scrollHeight, element.clientHeight]
      : [element.scrollLeft, element.scrollWidth, element.clientWidth];
  if (total <= visible + 1) return hidden;
  const size = Math.max(MIN_THUMB, (visible / total) * visible);
  const start = (offset / (total - visible)) * (visible - size);
  return { start, size, visible: true };
}

const sameBar = (a: Bar, b: Bar) =>
  a.visible === b.visible &&
  Math.round(a.start) === Math.round(b.start) &&
  Math.round(a.size) === Math.round(b.size);

function Track({
  along,
  bar,
  onPage,
  onDrag,
}: {
  along: Axis;
  bar: Bar;
  onPage: (event: ReactMouseEvent<HTMLDivElement>, along: Axis) => void;
  onDrag: (event: ReactPointerEvent<HTMLDivElement>, along: Axis) => void;
}) {
  if (!bar.visible) return null;
  return (
    <div
      className={along === "y" ? styles.trackY : styles.trackX}
      aria-hidden="true"
      onMouseDown={(event) => onPage(event, along)}
    >
      <div
        className={styles.thumb}
        style={
          along === "y"
            ? { top: bar.start, height: bar.size }
            : { left: bar.start, width: bar.size }
        }
        onPointerDown={(event) => onDrag(event, along)}
      />
    </div>
  );
}

interface ScrollAreaProps extends HTMLAttributes<HTMLElement> {
  /** Element used as the scrolling viewport. */
  as?: "div" | "article" | "aside" | "section" | "nav" | "pre";
  /** Scroll directions; bars are drawn only for these. */
  axis?: "x" | "y" | "both";
  /** Class of the outer box, which takes the viewport's place in layout. */
  className?: string;
  /** Class of the scrolling element itself. */
  viewportClassName?: string;
  viewportRef?: Ref<HTMLElement>;
  /** Attributes for the outer box (e.g. data attributes read by layout code). */
  boxProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>;
}

/**
 * Scroll container whose bars float over the content instead of taking
 * layout space (guides/desktop-app.md). The viewport keeps the caller's
 * element and children as they are, so selectors and scroll code that use it
 * directly keep working. Native scrollbars are hidden in global.css.
 */
export default function ScrollArea({
  as = "div",
  axis = "y",
  className = "",
  viewportClassName = "",
  viewportRef,
  boxProps,
  onScroll,
  children,
  ...viewportProps
}: ScrollAreaProps) {
  const viewport = useRef<HTMLElement>(null);
  useImperativeHandle(viewportRef, () => viewport.current!, []);
  const [vertical, setVertical] = useState(hidden);
  const [horizontal, setHorizontal] = useState(hidden);
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showY = axis !== "x";
  const showX = axis !== "y";

  const update = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    if (showY) {
      const next = measure(element, "y");
      setVertical((current) => (sameBar(current, next) ? current : next));
    }
    if (showX) {
      const next = measure(element, "x");
      setHorizontal((current) => (sameBar(current, next) ? current : next));
    }
  }, [showX, showY]);

  const flash = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), HIDE_DELAY_MS);
  }, []);

  // The viewport has no content wrapper, so watch its children directly:
  // added or resized children (rendered blocks, loaded images) change extent.
  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(update);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) resize.observe(child);
      update();
    };
    const mutations = new MutationObserver(observeChildren);
    mutations.observe(element, { childList: true });
    observeChildren();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      clearTimeout(hideTimer.current);
    };
  }, [update]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, along: Axis) {
    const element = viewport.current;
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    const bar = along === "y" ? vertical : horizontal;
    const [origin, scroll, total, visible] =
      along === "y"
        ? [
            event.clientY,
            element.scrollTop,
            element.scrollHeight,
            element.clientHeight,
          ]
        : [
            event.clientX,
            element.scrollLeft,
            element.scrollWidth,
            element.clientWidth,
          ];
    const ratio = (total - visible) / Math.max(1, visible - bar.size);
    const thumb = event.currentTarget;
    thumb.setPointerCapture?.(event.pointerId);
    setActive(true);
    const move = (moved: PointerEvent) => {
      const delta =
        ((along === "y" ? moved.clientY : moved.clientX) - origin) * ratio;
      if (along === "y") element.scrollTop = scroll + delta;
      else element.scrollLeft = scroll + delta;
    };
    const end = () => {
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", end);
      thumb.removeEventListener("pointercancel", end);
      flash();
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", end);
    thumb.addEventListener("pointercancel", end);
  }

  // Clicking the empty track moves one page toward the click.
  function pageJump(event: ReactMouseEvent<HTMLDivElement>, along: Axis) {
    const element = viewport.current;
    if (!element || event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const bar = along === "y" ? vertical : horizontal;
    const position =
      along === "y" ? event.clientY - box.top : event.clientX - box.left;
    const direction = position < bar.start ? -1 : 1;
    element.scrollBy(
      along === "y"
        ? { top: direction * element.clientHeight }
        : { left: direction * element.clientWidth },
    );
  }

  const viewportAxis =
    axis === "y" ? styles.axisY : axis === "x" ? styles.axisX : styles.axisBoth;
  return (
    <div
      {...boxProps}
      className={[
        styles.area,
        axis === "x" ? styles.areaX : "",
        active ? styles.active : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {createElement(
        as,
        {
          ...viewportProps,
          ref: viewport,
          className: [styles.viewport, viewportAxis, viewportClassName]
            .filter(Boolean)
            .join(" "),
          onScroll: (event: UIEvent<HTMLElement>) => {
            update();
            flash();
            onScroll?.(event);
          },
        },
        children,
      )}
      {showY ? (
        <Track along="y" bar={vertical} onPage={pageJump} onDrag={startDrag} />
      ) : null}
      {showX ? (
        <Track
          along="x"
          bar={horizontal}
          onPage={pageJump}
          onDrag={startDrag}
        />
      ) : null}
    </div>
  );
}
