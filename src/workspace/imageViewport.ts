/** Position and scale of an image drawn at `(x, y)` with `scale` in a frame. */
export interface ImageViewport {
  scale: number;
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
/** Space kept around a fitted image. */
const FIT_MARGIN = 24;
/** Image edge that always stays in the frame while dragging. */
const KEEP_VISIBLE = 48;
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

const clampScale = (scale: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Image centred in the frame at `scale`. */
export function centered(image: Size, frame: Size, scale: number) {
  return {
    scale,
    x: (frame.width - image.width * scale) / 2,
    y: (frame.height - image.height * scale) / 2,
  };
}

/** Whole image in the frame, shrunk if needed but never enlarged. */
export function fitted(image: Size, frame: Size): ImageViewport {
  if (!image.width || !image.height || frame.width <= 0 || frame.height <= 0)
    return { scale: 1, x: 0, y: 0 };
  const scale = clampScale(
    Math.min(
      1,
      (frame.width - FIT_MARGIN * 2) / image.width,
      (frame.height - FIT_MARGIN * 2) / image.height,
    ),
  );
  return centered(image, frame, scale);
}

/** Keeps at least a strip of the image inside the frame. */
export function clamped(
  view: ImageViewport,
  image: Size,
  frame: Size,
): ImageViewport {
  const width = image.width * view.scale;
  const height = image.height * view.scale;
  const keepX = Math.min(KEEP_VISIBLE, width);
  const keepY = Math.min(KEEP_VISIBLE, height);
  return {
    scale: view.scale,
    x: Math.min(frame.width - keepX, Math.max(keepX - width, view.x)),
    y: Math.min(frame.height - keepY, Math.max(keepY - height, view.y)),
  };
}

/** Rescales so the image point under `(px, py)` stays under it. */
export function zoomedAt(
  view: ImageViewport,
  scale: number,
  px: number,
  py: number,
): ImageViewport {
  const next = clampScale(scale);
  const ratio = next / view.scale;
  return {
    scale: next,
    x: px - (px - view.x) * ratio,
    y: py - (py - view.y) * ratio,
  };
}

/** Next button step above or below the current scale. */
export function steppedScale(scale: number, direction: 1 | -1) {
  const next =
    direction > 0
      ? ZOOM_STEPS.find((step) => step > scale + 1e-6)
      : [...ZOOM_STEPS].reverse().find((step) => step < scale - 1e-6);
  return next ?? clampScale(scale);
}
