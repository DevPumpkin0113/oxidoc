import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t, translateError } from "../settings/i18n";
import { workspaceApi } from "../workspace/api";
import {
  centered,
  clamped,
  fitted,
  MAX_SCALE,
  MIN_SCALE,
  steppedScale,
  zoomedAt,
  type ImageViewport,
  type Size,
} from "../workspace/imageViewport";
import {
  useDocumentContent,
  type DocumentSummary,
} from "../workspace/selectors";
import { useWorkspace } from "../workspace/store";
import Icon, { type IconName } from "./Icon";
import toolbarStyles from "./DocumentToolbar.module.css";
import styles from "./ImageView.module.css";

/** Zoom per wheel notch; touchpad pinches arrive as small Ctrl + wheel steps. */
const WHEEL_ZOOM = 1.15;
/** Above this scale pixels are drawn sharp instead of smoothed. */
const PIXELATED_FROM = 3;

type Loaded =
  | { key: string; state: "ready"; url: string }
  | { key: string; state: "failed"; error: string };

/** Approximate file size of a base64 data URL. */
function dataSize(url: string) {
  const base64 = url.slice(url.indexOf(",") + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ZoomButton({
  icon,
  label,
  ...props
}: {
  icon: IconName;
  label: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={toolbarStyles.toolButton}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

/**
 * Read-only view of a raster image in the project. The wheel zooms around
 * the cursor, dragging moves the image, and the toolbar fits it, shows it at
 * 100% or zooms in steps.
 */
export default function ImageView({ document }: { document: DocumentSummary }) {
  const root = useWorkspace((state) => state.project?.path);
  const projectName = useWorkspace((state) => state.project?.name);
  // The file stamp: changes when the image changes on disk.
  const revision = useDocumentContent(document.id);
  const key = JSON.stringify([root, document.id, revision]);
  const [loaded, setLoaded] = useState<Loaded>();
  const [image, setImage] = useState<Size>();
  const [view, setView] = useState<ImageViewport>({ scale: 1, x: 0, y: 0 });
  // Fit follows panel resizes until the user zooms or drags.
  const [fit, setFit] = useState(true);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: ImageViewport } | null>(
    null,
  );
  const current = loaded?.key === key ? loaded : undefined;
  const ready = current?.state === "ready" && image !== undefined;

  useEffect(() => {
    if (!root || !workspaceApi.advanced) return;
    let active = true;
    workspaceApi.advanced.image(root, document.id).then(
      (url) => active && setLoaded({ key, state: "ready", url }),
      (error) =>
        active && setLoaded({ key, state: "failed", error: String(error) }),
    );
    return () => {
      active = false;
    };
  }, [key, root, document.id]);

  const frameSize = (): Size => ({
    width: frame.current?.clientWidth ?? 0,
    height: frame.current?.clientHeight ?? 0,
  });

  // Refit on load and whenever the panel changes size in fit mode.
  useLayoutEffect(() => {
    const element = frame.current;
    if (!image || !fit || !element) return;
    const refit = () => setView(fitted(image, frameSize()));
    refit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [image, fit]);

  function zoomTo(scale: number, px?: number, py?: number) {
    if (!image) return;
    const size = frameSize();
    setFit(false);
    setView((previous) =>
      clamped(
        zoomedAt(previous, scale, px ?? size.width / 2, py ?? size.height / 2),
        image,
        size,
      ),
    );
  }

  // The wheel always zooms here (there is nothing to scroll); React's
  // wheel listener is passive and could not stop the panel from scrolling.
  useEffect(() => {
    const element = frame.current;
    if (!element || !ready || !image) return;
    const size = image;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const factor = event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM;
      setFit(false);
      setView((previous) =>
        clamped(
          zoomedAt(
            previous,
            previous.scale * factor,
            event.clientX - box.left,
            event.clientY - box.top,
          ),
          size,
          { width: element.clientWidth, height: element.clientHeight },
        ),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [ready, image]);

  return (
    <section className={styles.view} aria-label={document.name}>
      <div className={toolbarStyles.documentToolbar}>
        <div className={toolbarStyles.breadcrumb}>
          <Icon name="book" size={13} />
          <span>{projectName ?? t("작업 공간")}</span>
          <Icon name="chevron" size={11} />
          {document.folder ? (
            <>
              <span>{document.folder}</span>
              <Icon name="chevron" size={11} />
            </>
          ) : null}
          <strong>{document.name}</strong>
        </div>
        <div className={toolbarStyles.documentTools}>
          <ZoomButton
            icon="minus"
            label={t("축소")}
            disabled={!ready || view.scale <= MIN_SCALE + 1e-6}
            onClick={() => zoomTo(steppedScale(view.scale, -1))}
          />
          <span className={styles.zoom} aria-live="polite">
            {ready ? `${Math.round(view.scale * 100)}%` : ""}
          </span>
          <ZoomButton
            icon="add"
            label={t("확대")}
            disabled={!ready || view.scale >= MAX_SCALE - 1e-6}
            onClick={() => zoomTo(steppedScale(view.scale, 1))}
          />
          <button
            type="button"
            className={styles.textButton}
            aria-pressed={fit}
            disabled={!ready}
            onClick={() => setFit(true)}
          >
            {t("맞춤")}
          </button>
          <button
            type="button"
            className={styles.textButton}
            aria-pressed={!fit && Math.abs(view.scale - 1) < 1e-6}
            disabled={!ready}
            onClick={() => {
              if (!image) return;
              setFit(false);
              setView(
                clamped(centered(image, frameSize(), 1), image, frameSize()),
              );
            }}
          >
            100%
          </button>
        </div>
      </div>
      <div
        ref={frame}
        className={styles.canvas}
        data-dragging={dragging || undefined}
        data-ready={ready || undefined}
        onPointerDown={(event) => {
          if (!ready || event.button !== 0) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, view };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || !image) return;
          setFit(false);
          setView(
            clamped(
              {
                scale: start.view.scale,
                x: start.view.x + event.clientX - start.x,
                y: start.view.y + event.clientY - start.y,
              },
              image,
              frameSize(),
            ),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => ready && setFit(true)}
      >
        {!current ? (
          <p className={styles.message}>{t("이미지를 불러오는 중…")}</p>
        ) : current.state === "failed" ? (
          <p className={styles.message} role="alert">
            <Icon name="warning" size={16} />
            {translateError(current.error)}
          </p>
        ) : (
          <img
            className={styles.image}
            src={current.url}
            alt={document.name}
            draggable={false}
            data-pixelated={view.scale >= PIXELATED_FROM || undefined}
            style={{
              width: image?.width,
              height: image?.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              visibility: image ? undefined : "hidden",
            }}
            onLoad={(event) =>
              setImage({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        )}
      </div>
      {ready ? (
        <p className={styles.info}>
          {image.width} × {image.height} ·{" "}
          {document.name.split(".").pop()?.toUpperCase()} ·{" "}
          {dataSize(current.url)}
        </p>
      ) : null}
    </section>
  );
}
