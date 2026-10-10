/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Paths, outlines and lens edges on the stage canvas.
import type { Derived } from "./derive";
import type { Pt } from "./homography";
import { dot, EDGE, LINE, PATH, tag } from "./overlay-parts";
import { shortReading } from "./reading";
import type { RulerState } from "./state";

const COLOR = { path: PATH, area: LINE, edge: EDGE } as const;

export function drawShapes(
  ctx: CanvasRenderingContext2D,
  s: RulerState,
  d: Derived,
  at: (p: Pt) => { x: number; y: number },
) {
  s.shapes.forEach((sh, i) => {
    if (!sh.pts.length) return;
    const color = COLOR[sh.kind],
      pts = sh.pts.map(at);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(sh.kind === "edge" ? [6, 4] : []);
    ctx.beginPath();
    pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (sh.kind === "area" && sh.done) ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach((p) => dot(ctx, p.x, p.y, color, ""));
    const row = d.shapes.find((r) => r.shape === i);
    if (row && sh.done) {
      const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length,
        cy = pts.reduce((t, p) => t + p.y, 0) / pts.length,
        text =
          row.kind === "area"
            ? (row.areaText ?? "crosses itself")
            : row.lengthText;
      // Named, so a label inside an outline is not read as belonging to
      // whatever else stands there (a box, a wall).
      tag(`${row.label}: ${shortReading(text)}`, cx - 30, cy, color);
    }
  });
}
