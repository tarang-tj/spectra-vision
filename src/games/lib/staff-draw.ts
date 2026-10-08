/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Draws Conductor's staff: one row per note of the scale, the melody
// arriving from the right, the "now" line, and what each hand actually
// played scrolling away to the left.
import type { Frame } from "../../vision/frame";
import { AMBER, INK, MINT, MUTED, ROSE, write } from "./hud";
import * as music from "./music-logic";
import type { Target } from "./music-logic";

/** A stretch of time one hand spent on one row. `to` is OPEN while it lasts. */
export const OPEN = -1;
export type Played = { lane: number; from: number; to: number; hand: number };
export type StaffView = {
  targets: Target[];
  /** First unsettled target. */
  cursor: number;
  played: Played[];
  /** Row each hand is on (-1 for none) and its filter cutoff in Hz. */
  lanes: ArrayLike<number>;
  cutoffs: ArrayLike<number>;
  /** Ms into the round. */
  clock: number;
  /** Ms since the last drum flick. */
  drumAge: number;
};

const NAMES = ["A", "B", "C#", "E", "F#"];
export const HAND_COLORS = [MINT, "#67aaff"];
/** How far ahead (ms) a note is when it enters at the right edge. */
const LOOKAHEAD_MS = 2600;
const NOW_AT = 0.3;

export function drawStaff(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  view: StaffView,
  playing: boolean,
) {
  const { rect } = frame,
    nowX = rect.x + rect.w * NOW_AT,
    perMs = (rect.w * (1 - NOW_AT)) / LOOKAHEAD_MS,
    rowH = ((music.STAFF_BOTTOM - music.STAFF_TOP) / music.LANES) * rect.h,
    rowY = (lane: number) => rect.y + music.laneCentre(lane) * rect.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  for (let lane = 0; lane < music.LANES; lane++) {
    const y = rowY(lane),
      held = view.lanes[0] === lane || view.lanes[1] === lane;
    if (held) {
      ctx.fillStyle = "#a4ffd91f";
      ctx.fillRect(rect.x, y - rowH / 2, rect.w, rowH);
    }
    ctx.fillStyle = held ? "#a4ffd9aa" : "#f3f7f64d";
    ctx.fillRect(rect.x, y, rect.w, 1);
    write(
      ctx,
      NAMES[lane % NAMES.length],
      rect.x + 22,
      y,
      11,
      held ? MINT : MUTED,
    );
  }
  // What was played: one bar per note, as long as it was held.
  for (let i = 0; i < view.played.length; i++) {
    const note = view.played[i],
      x1 = nowX - (view.clock - note.from) * perMs,
      x2 = nowX - (note.to === OPEN ? 0 : view.clock - note.to) * perMs;
    if (x2 < rect.x) continue;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = HAND_COLORS[note.hand];
    ctx.fillRect(x1, rowY(note.lane) - 4, Math.max(4, x2 - x1), 8);
  }
  ctx.globalAlpha = 1;
  // The melody: a note is amber while it can be hit.
  for (let i = Math.max(0, view.cursor - 4); i < view.targets.length; i++) {
    const target = view.targets[i],
      ahead = target.at - view.clock;
    if (ahead > LOOKAHEAD_MS) break;
    if (ahead < -900) continue;
    const x = nowX + ahead * perMs,
      y = rowY(target.lane),
      open = Math.abs(ahead) <= music.HIT_WINDOW_MS,
      color =
        target.state === music.HIT
          ? MINT
          : target.state === music.MISSED
            ? ROSE
            : open
              ? AMBER
              : "#ae94fa",
      h = rowH * 0.62,
      w = Math.max(34, rowH * 1.3);
    ctx.globalAlpha =
      target.state === music.PENDING ? 1 : Math.max(0, 1 + ahead / 900);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = color + (target.state === music.MISSED ? "55" : "dd");
    ctx.shadowColor = color;
    ctx.shadowBlur = open ? 22 : 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = playing ? "#f3f7f6cc" : "#f3f7f655";
  ctx.fillRect(
    nowX - 1,
    rect.y + music.STAFF_TOP * rect.h - 10,
    2,
    rowH * music.LANES + 20,
  );
  // Each hand's note on the now line. A brighter filter draws a larger dot.
  for (let hand = 0; hand < 2; hand++) {
    const lane = view.lanes[hand];
    if (lane < 0) continue;
    const bright = Math.log(view.cutoffs[hand] / 350) / Math.log(6000 / 350);
    ctx.beginPath();
    ctx.arc(
      nowX,
      rowY(lane),
      8 + 9 * Math.min(1, Math.max(0, bright)),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = HAND_COLORS[hand];
    ctx.shadowColor = HAND_COLORS[hand];
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // A drum flick thumps the bottom of the staff.
  if (view.drumAge < 260) {
    const t = view.drumAge / 260,
      y = rect.y + music.STAFF_BOTTOM * rect.h + 16;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = INK;
    ctx.fillRect(rect.x, y, rect.w, 6 * (1 - t) + 1);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
