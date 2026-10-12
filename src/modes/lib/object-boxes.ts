/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What Objects draws for one frame: the tracks of the latest result with
// their boxes smoothed (vision/track-smooth.ts), and each box with its label.
// Smoothing is for the drawn boxes only and follows the Smooth setting; the
// inspector, the effects, the Lab and the session export keep the raw tracks.
import type { Frame } from "../../vision/frame";
import { smoothingOn } from "../../vision/settings";
import { TrackSmoother } from "../../vision/track-smooth";
import { COLORS, type Track } from "../../vision/types";
import { finerFor, finerText } from "./finer";

const smoother = new TrackSmoother();
let from: readonly Track[] | null = null,
  drawn: readonly Track[] = [],
  session = -1;

/** Forget the filters: the mode was left, or smoothing was switched off. */
export function forgetDrawn() {
  smoother.reset();
  from = null;
  drawn = [];
}

/** The frame's tracks as they are drawn, in the same order. The filter runs
 * once per result (a new `tracks` list), not once per drawn frame, and starts
 * again on a new source, where track ids start again too. */
export function drawnTracks(frame: Frame): readonly Track[] {
  const { tracks, result } = frame;
  if (!result || !smoothingOn()) {
    if (from) forgetDrawn();
    return tracks;
  }
  if (tracks === from) return drawn;
  if (result.generation !== session) {
    smoother.reset();
    session = result.generation;
  }
  from = tracks;
  return (drawn = smoother.apply(tracks, result.time));
}

/** How strongly a held box is drawn against one the latest result found. */
const HELD_ALPHA = 0.45;

/** One tracked box: a thin outline, corner brackets and a label chip. A held
 * track (the latest result missed it) is drawn dimmed and dashed, and its
 * label says so in place of a score it does not have. */
export function drawBox(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  t: Track,
  opacity: number,
) {
  const { rect, mirror } = frame,
    color = COLORS[(t.id - 1) % COLORS.length],
    b = t.box,
    q = frame.project({ x: mirror ? b.x + b.w : b.x, y: b.y }),
    w = b.w * rect.w,
    h = b.h * rect.h;
  if (t.held) {
    opacity *= HELD_ALPHA;
    ctx.setLineDash([6, 5]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = opacity * 0.55;
  ctx.strokeRect(q.x, q.y, w, h);
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 2.5;
  const c = Math.min(20, w / 4, h / 4);
  ctx.beginPath();
  [
    [q.x, q.y, 1, 1],
    [q.x + w, q.y, -1, 1],
    [q.x, q.y + h, 1, -1],
    [q.x + w, q.y + h, -1, -1],
  ].forEach(([x, y, sx, sy]) => {
    ctx.moveTo(x + c * sx, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + c * sy);
  });
  ctx.stroke();
  const finer = finerFor(t),
    label = `${t.label}  ${t.held ? HELD : `${(t.score * 100).toFixed(0)}%`} · ${finer ? `${finerText(finer)} · ` : ""}${String(t.id).padStart(2, "0")}`;
  ctx.font = "600 12px Inter Variable, sans-serif";
  const tw = ctx.measureText(label).width + 14,
    lx = Math.min(Math.max(q.x, rect.x), rect.x + rect.w - tw),
    ly = Math.max(rect.y + 8, q.y - 25);
  ctx.fillStyle = color;
  ctx.fillRect(lx, ly, tw, 23);
  ctx.fillStyle = "#07130e";
  ctx.fillText(label, lx + 7, ly + 16);
}

/** What a held track shows where a found one shows its score. */
export const HELD = "held";
