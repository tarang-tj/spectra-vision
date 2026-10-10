/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls tool's drawing on the frozen picture: the floor outline, each
// wall edge up to its ceiling point and the ceiling outline, with lengths and
// heights. An edge whose height is assumed is dashed and says so.
import { projectPoint } from "../../../measure/camera";
import type { DrawEnv } from "../extension-types";
import { dot, tag } from "../overlay-parts";
import { currentWalls } from "./current";
import { heightAt } from "./shell";
import { getWalls } from "./store";
import { lengthText } from "./text";

const WALL = "#d9b3ff";
type C = { x: number; y: number };

function line(ctx: CanvasRenderingContext2D, a: C, b: C, dashed: boolean) {
  ctx.setLineDash(dashed ? [6, 5] : []);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function drawWalls(ctx: CanvasRenderingContext2D, env: DrawEnv) {
  const walls = getWalls(),
    n = walls.corners.length;
  if (!n) return;
  const { numbers, camera, basis } = currentWalls(env.s, env.d),
    unit = env.s.unit,
    base = walls.corners.map((c) => env.tapToCanvas(c.base)),
    sides = walls.closed ? n : n - 1;
  ctx.strokeStyle = WALL;
  ctx.lineWidth = 2;
  for (let i = 0; i < sides; i++) {
    const a = base[i],
      b = base[(i + 1) % n];
    line(ctx, a, b, false);
    if (numbers)
      tag(
        ctx,
        `${i + 1}: ${lengthText(numbers.walls[i], unit, basis)}`,
        (a.x + b.x) / 2 + 6,
        (a.y + b.y) / 2 + 16,
        WALL,
      );
  }
  // Where each wall edge meets the ceiling: the tap itself, or for a corner
  // with no tap the point the mean height puts it at.
  const shell = numbers?.meanHeight ? numbers.shell : null,
    top = walls.corners.map((c, i): { at: C; own: boolean } | null => {
      if (c.top) return { at: env.tapToCanvas(c.top), own: true };
      const z = shell ? heightAt(shell, i) : null,
        p =
          shell && camera && z !== null
            ? projectPoint(camera, shell.floor[i].x, shell.floor[i].y, z)
            : null;
      return p ? { at: env.toCanvas(p), own: false } : null;
    });
  top.forEach((t, i) => {
    if (!t) return;
    line(ctx, base[i], t.at, !t.own);
    const next = top[(i + 1) % n];
    if (next && walls.closed) line(ctx, t.at, next.at, !(t.own && next.own));
  });
  ctx.setLineDash([]);
  top.forEach((t, i) => {
    if (!t) return;
    if (t.own) dot(ctx, t.at.x, t.at.y, WALL, "");
    const q = numbers?.heights[i] ?? null;
    tag(
      ctx,
      t.own
        ? `height ${lengthText(q, unit, basis)}`
        : `height assumed ${lengthText(numbers?.meanHeight ?? null, unit, basis)}`,
      t.at.x + 10,
      t.at.y - 10,
      WALL,
    );
  });
  base.forEach((p, i) =>
    dot(
      ctx,
      p.x,
      p.y,
      WALL,
      walls.pick === i ? `${i + 1} (ceiling next)` : String(i + 1),
    ),
  );
}
