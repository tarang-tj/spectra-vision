/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One frame for several pictures. Each picture's plane map puts the floor in
// millimetres with its origin at one corner of the reference, and which
// corner depends on where the camera stood. So two pictures of one sheet
// agree only up to a turn of the sheet onto itself: a half turn for a
// rectangle, any quarter turn for a square. This file finds those turns,
// chooses one from points marked in both pictures, and refuses in words when
// the points cannot decide or do not agree. Pure: no DOM, no clock.
import type { Pt } from "../homography";

/** A turn and a shift on the floor: x' = a x - b y + tx, y' = b x + a y + ty. */
export type Rigid = {
  /** Quarter turns between the picture's own frame and the room's. */
  turn: number;
  a: number;
  b: number;
  tx: number;
  ty: number;
};
/** The spread of a floor position, mm squared. */
export type Cov = { xx: number; xy: number; yy: number };
/** A floor position (mm) and how well it is known. */
export type Fix = { at: Pt; cov: Cov };

export const IDENTITY: Rigid = { turn: 0, a: 1, b: 0, tx: 0, ty: 0 };
export const applyRigid = (t: Rigid, p: Pt): Pt => ({
  x: t.a * p.x - t.b * p.y + t.tx,
  y: t.b * p.x + t.a * p.y + t.ty,
});
/** The same spread, seen in the turned frame. */
export const turnCov = (t: Rigid, c: Cov): Cov => ({
  xx: t.a * t.a * c.xx - 2 * t.a * t.b * c.xy + t.b * t.b * c.yy,
  xy: t.a * t.b * (c.xx - c.yy) + (t.a * t.a - t.b * t.b) * c.xy,
  yy: t.b * t.b * c.xx + 2 * t.a * t.b * c.xy + t.a * t.a * c.yy,
});
export const addCov = (p: Cov, q: Cov): Cov => ({
  xx: p.xx + q.xx,
  xy: p.xy + q.xy,
  yy: p.yy + q.yy,
});

/** Every turn that lays the rectangle `from` (four corners in order, one
 * picture's own frame) exactly onto the rectangle `to` (the room's). Two for
 * a rectangle, four for a square, none when the sizes differ. */
export function symmetries(from: readonly Pt[], to: readonly Pt[]): Rigid[] {
  if (from.length !== 4 || to.length !== 4) return [];
  const out: Rigid[] = [],
    side = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y),
    tol = 1e-6 * Math.max(1, side);
  for (let turn = 0; turn < 4; turn++) {
    const p = to[turn],
      q = to[(turn + 1) % 4],
      angle =
        Math.atan2(q.y - p.y, q.x - p.x) -
        Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x),
      // The sheet's sides are square to its own axes: snap the turn.
      a = Math.round(Math.cos(angle)),
      b = Math.round(Math.sin(angle)),
      t: Rigid = {
        turn,
        a,
        b,
        tx: p.x - (a * from[0].x - b * from[0].y),
        ty: p.y - (b * from[0].x + a * from[0].y),
      };
    if (
      from.every((c, i) => {
        const m = applyRigid(t, c),
          want = to[(turn + i) % 4];
        return Math.hypot(m.x - want.x, m.y - want.y) <= tol;
      })
    )
      out.push(t);
  }
  return out;
}

/** How many standard deviations two positions on a floor may be apart and
 * still be one point, when `anchors` such pairs are judged together: the
 * region that holds all of them 95 times in 100 when they are the same
 * points. (For one number that region is 2 sd; for one position on a floor
 * it is 2.45, and it grows slowly with the number of pairs, so that marking
 * more points does not by itself get a good picture refused.) */
export const limitFor = (anchors: number): number =>
  Math.sqrt(-2 * Math.log(0.05 / Math.max(1, anchors)));
/** Positions cannot be told apart finer than this, whatever the bars say. */
const FLOOR_MM2 = 1;

/** `d` in standard deviations of the spread `c`. */
export function inBars(d: Pt, c: Cov): number {
  const xx = c.xx + FLOOR_MM2,
    yy = c.yy + FLOOR_MM2,
    det = xx * yy - c.xy * c.xy;
  if (!(det > 0)) return Infinity;
  return Math.sqrt(
    Math.max(0, (yy * d.x * d.x - 2 * c.xy * d.x * d.y + xx * d.y * d.y) / det),
  );
}

/** One point marked in this picture (`here`, its own frame) and in pictures
 * already on the plan (`there`, where they together put it, room frame). */
export type Anchor = { name: string; here: Fix; there: Fix };
export type AnchorCheck = {
  name: string;
  /** The turn that brings the two positions closest. */
  turn: number;
  /** How far apart they then are, and how far the two bars together allow in
   * that direction, mm. */
  gapMm: number;
  allowedMm: number;
  verdict: "agrees" | "undecided" | "apart";
  /** The gap in bars under each candidate turn, keyed by turn. */
  bars: Record<number, number>;
};

/** Try every candidate turn on one anchor. `limit` is `limitFor` the number
 * of anchors judged together. */
export function checkAnchor(
  candidates: readonly Rigid[],
  a: Anchor,
  limit: number,
): AnchorCheck {
  const tries = candidates.map((t) => {
      const at = applyRigid(t, a.here.at),
        cov = addCov(turnCov(t, a.here.cov), a.there.cov),
        d = { x: at.x - a.there.at.x, y: at.y - a.there.at.y };
      return { t, at, cov, gap: Math.hypot(d.x, d.y), bars: inBars(d, cov) };
    }),
    best = tries.reduce((m, c) => (c.gap < m.gap ? c : m)),
    // How far the other turns would put this point from the best one, in
    // bars. Small when the point is near the sheet's middle or its bar is
    // wide: then it cannot say which way round the sheet is.
    rival = Math.min(
      ...tries
        .filter((c) => c !== best)
        .map((c) =>
          inBars({ x: c.at.x - best.at.x, y: c.at.y - best.at.y }, best.cov),
        ),
    ),
    least = Math.min(...tries.map((c) => c.bars));
  return {
    name: a.name,
    turn: best.t.turn,
    gapMm: best.gap,
    allowedMm: best.bars > 0 ? (best.gap * limit) / best.bars : Infinity,
    verdict:
      least > limit
        ? "apart"
        : rival < 2 * limit
          ? "undecided"
          : best.bars <= limit
            ? "agrees"
            : "apart",
    bars: Object.fromEntries(tries.map((c) => [c.t.turn, c.bars])),
  };
}

export type Placement =
  | { state: "placed"; rigid: Rigid; checks: AnchorCheck[]; text: string }
  | {
      state: "refused";
      reason: "size" | "apart" | "contradiction" | "undecided";
      checks: AnchorCheck[];
      text: string;
    }
  | { state: "unanchored"; checks: AnchorCheck[]; text: string };

const mm = (v: number) => `${Math.round(v)} mm`;
const TURNS = [
  "the same way round",
  "a quarter turn round",
  "half way round",
  "three quarter turns round",
];

/** Place one picture in the room's frame from its anchors, or say why not.
 * `name` is the picture's ("Picture 2"). A picture is placed only when at
 * least one anchor decides the turn, none disagrees with it beyond the bars,
 * and no two decide differently. */
export function placeView(
  name: string,
  candidates: readonly Rigid[],
  anchors: readonly Anchor[],
): Placement {
  if (!candidates.length)
    return {
      state: "refused",
      reason: "size",
      checks: [],
      text: `${name} is not on the plan: its reference is not the size of the first picture's. Choose the same reference in every picture of one room.`,
    };
  if (!anchors.length)
    return {
      state: "unanchored",
      checks: [],
      text: `${name} is not on the plan yet. Mark in it one point that is also marked in a picture already on the plan.`,
    };
  const limit = limitFor(anchors.length),
    checks = anchors.map((a) => checkAnchor(candidates, a, limit)),
    refuse = (
      reason: "apart" | "contradiction" | "undecided",
      text: string,
    ): Placement => ({ state: "refused", reason, checks, text }),
    moved = (c: AnchorCheck, gap = c.gapMm, allowed = c.allowedMm) =>
      refuse(
        "apart",
        `${name} is not on the plan: ${c.name} lands ${mm(gap)} from where the other picture puts it, and the two bars together allow ${mm(allowed)}. The sheet may have moved between pictures, or these are different points. If the reference's long and short sides are swapped in one picture, press Swap sides there.`,
      ),
    apart = checks.find((c) => c.verdict === "apart");
  if (apart) return moved(apart);
  const deciding = checks.filter((c) => c.verdict === "agrees"),
    other = deciding.find((c) => c.turn !== deciding[0].turn);
  if (other)
    return refuse(
      "contradiction",
      `${name} is not on the plan: ${deciding[0].name} and ${other.name} disagree about which way round the sheet lies. One of them is not the same point in both pictures.`,
    );
  if (!deciding.length)
    return refuse(
      "undecided",
      `${name} is not on the plan: ${checks[0].name} cannot tell which way round the sheet lies. It is too near the middle of the sheet for its bar. Mark a point further from the sheet.`,
    );
  const rigid = candidates.find((t) => t.turn === deciding[0].turn)!,
    // A point that could not decide must still fit the turn the others chose.
    off = checks.find((c) => c.bars[rigid.turn] > limit);
  if (off)
    return moved(
      off,
      (off.gapMm * off.bars[rigid.turn]) / Math.max(off.bars[off.turn], 1e-9),
    );
  const first = deciding[0];
  return {
    state: "placed",
    rigid,
    checks,
    text: `${name} is on the plan, ${TURNS[rigid.turn]} from how its own corners read. ${first.name} decides it: the two pictures put it ${mm(first.gapMm)} apart and the two bars together allow ${mm(first.allowedMm)}.`,
  };
}
