/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Text labels on the Ruler's stage drawing. Nothing is written the moment it
// is asked for: every label of a frame is queued, then all are placed and
// drawn together, last, so they sit on top of the lines.
//
// The rule, in the order it is applied:
// 1. Each label has a rank. "key" is a result (a reading, a verdict, a wall's
//    number). "optional" explains the drawing (a reference's edge sizes and
//    name, a height). "detail" is the rest (the corner numbers of a finished
//    reference, the box's typed sizes, "turn").
// 2. Key labels are placed first, then optional, then detail, so a result
//    never gives way to a corner number.
// 3. A label goes where it was asked for unless that covers a handle or a
//    label already placed. Then the spots around it are tried in turn (above,
//    below, left, right, the diagonals, two rows up or down). A detail label
//    tries only the first five, so a corner number never drifts away from
//    its corner; an optional label does not try the two-row spots.
// 4. With no free spot, a key label is still drawn, where it covers least.
//    Any other label is left out: it is on the panel too.
// 5. Every label is moved to lie wholly inside the stage.
// 6. When the picture is shown narrower than COMPACT_BELOW CSS pixels (a
//    phone), detail labels are left out altogether, the text is 11 px
//    instead of 12, and callers shorten their words (see isCompact).
/** The dark plate behind a label, and the loupe's backing. */
export const INK = "#0b1214";

export type Rank = "key" | "optional" | "detail";
export type Box = { x: number; y: number; w: number; h: number };
export type Sized = Box & { rank: Rank };

export const COMPACT_BELOW = 480;
const RANKS: Rank[] = ["key", "optional", "detail"],
  // In label widths and label heights from the asked spot.
  SPOTS = [
    [0, 0],
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -2],
    [0, 2],
  ],
  // How many of SPOTS a label of each rank may try.
  REACH: Record<Rank, number> = { key: 11, optional: 9, detail: 5 },
  GAP = 3;

type Queued = { text: string; x: number; y: number; color: string; rank: Rank };
const queue: Queued[] = [],
  handles: Box[] = [];
let compact = false;

/** Start a frame's labels. `pictureWidth` is the picture as shown, CSS px. */
export function beginLabels(pictureWidth: number) {
  queue.length = 0;
  handles.length = 0;
  compact = pictureWidth < COMPACT_BELOW;
}
/** True on a narrow stage: callers then use their shorter wording. */
export const isCompact = (): boolean => compact;

/** Ask for a label whose text starts at `x` with its baseline near `y`. */
export function tag(
  text: string,
  x: number,
  y: number,
  color: string,
  rank: Rank = "key",
) {
  queue.push({ text, x, y, color, rank });
}
/** Keep labels off a handle drawn at this point. */
export function keepClear(x: number, y: number, r = 5) {
  handles.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
}

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Where each label goes, or null for one that is left out. Pure: the rule
 * above, steps 2 to 6. `labels` are in drawing order with the spot asked for. */
export function placeLabels(
  labels: readonly Sized[],
  blocked: readonly Box[],
  width: number,
  height: number,
  narrow = false,
): (Box | null)[] {
  const out: (Box | null)[] = labels.map(() => null),
    taken: Box[] = [...blocked];
  for (const rank of RANKS) {
    if (narrow && rank === "detail") continue;
    labels.forEach((l, i) => {
      if (l.rank !== rank) return;
      let best: Box | null = null,
        least = Infinity;
      for (const [dx, dy] of SPOTS.slice(0, REACH[rank])) {
        const b = {
            x: Math.max(2, Math.min(width - l.w - 2, l.x + dx * (l.w + GAP))),
            y: Math.max(2, Math.min(height - l.h - 2, l.y + dy * (l.h + GAP))),
            w: l.w,
            h: l.h,
          },
          over = taken.reduce((t, o) => t + overlap(b, o), 0);
        if (over < least) {
          best = b;
          least = over;
        }
        if (!over) break;
      }
      if (!best || (least > 0 && rank !== "key")) return;
      out[i] = best;
      taken.push(best);
    });
  }
  return out;
}

/** Place and draw the frame's labels. `width` and `height` are the stage's. */
export function flushLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const h = compact ? 16 : 18;
  ctx.save();
  ctx.setLineDash([]);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${compact ? 11 : 12}px system-ui, sans-serif`;
  const sized = queue.map(
      (q): Sized => ({
        x: q.x - 5,
        y: q.y - 11,
        w: ctx.measureText(q.text).width + 10,
        h,
        rank: q.rank,
      }),
    ),
    spots = placeLabels(sized, handles, width, height, compact);
  spots.forEach((b, i) => {
    if (!b) return;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = queue[i].color;
    ctx.fillText(queue[i].text, b.x + 5, b.y + h - 5);
  });
  ctx.restore();
  queue.length = 0;
  handles.length = 0;
}
