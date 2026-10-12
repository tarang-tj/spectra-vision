/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Room tool's drawing on the picture: the room points marked in it, the
// outline's walls where both ends can be drawn, and, once this picture is on
// the plan, where the plan puts the points marked only in other pictures
// (hollow, dashed, and said to be from the plan). Those are a check on the
// picture's placement and a help in finding the same spot.
import type { DrawEnv } from "../extension-types";
import { invert3, toImage } from "../known/fused-maths";
import { dot, tag } from "../overlay-parts";
import { readingText, shortReading } from "../reading";
import { currentRoom, stageView } from "./current";
import { toOwn } from "./room-solve";
import { getRoom } from "./store";
import { lengthOf } from "./text";

export const ROOM = "#ff9d7a";
type C = { x: number; y: number };

export function drawRoom(ctx: CanvasRenderingContext2D, env: DrawEnv) {
  const view = stageView(env.s.generation),
    room = getRoom();
  if (!view || !room.points.length) return;
  const { solution } = currentRoom(),
    rigid = solution.views.find((v) => v.id === view.id)?.rigid ?? null,
    sheet = env.d.sheet,
    back = rigid && sheet ? invert3(sheet.h) : null,
    { width, height } = env.frame,
    own = new Map<number, C>(),
    ghost = new Map<number, C>();
  for (const p of room.points) {
    const o = p.obs.find((x) => x.view === view.id);
    if (o) own.set(p.id, env.tapToCanvas(o.at));
  }
  if (rigid && sheet && back)
    for (const p of solution.points) {
      if (own.has(p.id) || !p.sample) continue;
      const at = toOwn(rigid, p.sample.at),
        flat = toImage(back, sheet.h, at.x, at.y),
        c = flat ? env.toCanvas(flat) : null;
      if (c && c.x >= 0 && c.y >= 0 && c.x <= width && c.y <= height)
        ghost.set(p.id, c);
    }
  const at = (id: number) => own.get(id) ?? ghost.get(id) ?? null,
    n = room.outline.length,
    sides = room.closed ? n : n - 1,
    numbers = solution.numbers;
  ctx.strokeStyle = ROOM;
  ctx.lineWidth = 2;
  for (let i = 0; i < sides; i++) {
    const a = room.outline[i],
      b = room.outline[(i + 1) % n],
      p = at(a),
      q = at(b);
    if (!p || !q) continue;
    // Dashed when an end is where the plan puts it, not where it was tapped.
    ctx.setLineDash(own.has(a) && own.has(b) ? [] : [6, 5]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    const wall = numbers?.walls[i];
    if (wall)
      tag(
        `wall ${i + 1}: ${shortReading(readingText(lengthOf(wall, env.s.unit, "")))}`,
        (p.x + q.x) / 2 + 6,
        (p.y + q.y) / 2 + 16,
        ROOM,
      );
  }
  ctx.setLineDash([]);
  for (const [id, c] of ghost) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    tag(`R${id} from the plan`, c.x + 10, c.y - 10, ROOM, "optional");
  }
  for (const [id, c] of own) dot(ctx, c.x, c.y, ROOM, `R${id}`, "key");
}
