export type ScrollEdge = "start" | "end";
export function scrollEdge(
  top: number,
  height: number,
  viewport: number,
): ScrollEdge | undefined {
  if (top <= 1) return "start";
  const maximum = Math.max(0, height - viewport);
  if (maximum > 1 && top >= maximum - 1) return "end";
  return undefined;
}
