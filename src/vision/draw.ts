import type { Frame } from "./frame";
import type { Point } from "./types";

/** Stroke a polyline of image-normalized points with an optional glow. Shared
 * by modes and effects so model geometry keeps one look. */
export function strokePath(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  points: Point[],
  color: string,
  lineWidth: number,
  glow = 0,
) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((p, i) => {
    const q = frame.project(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.stroke();
  ctx.shadowBlur = 0;
}
