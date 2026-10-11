/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One frame for several pictures. Each picture's plane map puts the floor in
// millimetres with its origin at one corner of the reference, and which
// corner depends on where the camera stood. So two pictures of one sheet
// agree only up to a turn of the sheet onto itself: a half turn for a
// rectangle, any quarter turn for a square. This file finds those turns,
// chooses one from points marked in both pictures, and refuses in words when
// the points cannot decide or do not agree. Pure: no DOM, no clock.
import type { Pt } from "../homography";
import {
  addCov,
  applyRigid,
  inBars,
  limitFor,
  turnCov,
  type Fix,
  type Rigid,
} from "./floor-maths";

export * from "./floor-maths";

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

/** Every reflection that lays the rectangle `from` onto the rectangle `to`:
 * two for a rectangle (across its two centre lines), four for a square (the
 * diagonals too), none when the sizes differ. A picture saved flipped left
 * to right reads the floor through one of these. */
export function reflections(from: readonly Pt[], to: readonly Pt[]): Rigid[] {
  if (from.length !== 4 || to.length !== 4) return [];
  const mid = (r: readonly Pt[]) => ({
      x: (r[0].x + r[2].x) / 2,
      y: (r[0].y + r[2].y) / 2,
    }),
    f = mid(from),
    g = mid(to),
    tol =
      1e-6 *
      Math.max(1, Math.hypot(from[2].x - from[0].x, from[2].y - from[0].y));
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].flatMap(([a, b], turn): Rigid[] => {
    const t: Rigid = {
      turn,
      a,
      b,
      tx: g.x - (a * f.x + b * f.y),
      ty: g.y - (b * f.x - a * f.y),
      mirror: true,
    };
    return from.every((c) => {
      const m = applyRigid(t, c);
      return to.some((w) => Math.hypot(m.x - w.x, m.y - w.y) <= tol);
    })
      ? [t]
      : [];
  });
}

/** One point marked in this picture (`here`, its own frame) and in pictures
 * already on the plan (`there`, where they together put it, room frame). */
export type Anchor = {
  name: string;
  /** Every picture the point is marked in, this one included, in words
   * ("pictures 1 and 2"). A refusal names them all: any may be the wrong one. */
  pictures: string;
  here: Fix;
  there: Fix;
};
export type AnchorCheck = {
  name: string;
  pictures: string;
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
    pictures: a.pictures,
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
      /** The shared points suggest a turn but cannot confirm it: one point
       * alone, or several too close together to count as two. Such a picture
       * is listed and contributes nothing. */
      state: "provisional";
      turn: number;
      reason: "one" | "close" | "line";
      checks: AnchorCheck[];
      text: string;
    }
  | {
      state: "refused";
      reason: "size" | "apart" | "contradiction" | "undecided" | "mirror";
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
/** Who shares the disputed points. An earlier picture may be the one that
 * was tied in wrongly, so every picture is named, not only the newest. */
const sharers = (checks: AnchorCheck[]) =>
  `${checks
    .map((c, i) => `${c.name} ${i ? "" : "is marked "}in ${c.pictures}`)
    .join(
      ", ",
    )}; any one of those marks may be the wrong one, in an earlier picture as well as in this one.`;

/** A turn and a reflection count as told apart by a shared point only when
 * the two positions they predict for it are this many agreement radii apart.
 * At 2 (the bare "the two regions do not overlap") noise could carry a mark
 * of a flipped picture that far from a centre line while the turn still
 * passed: 21 of 200,000 noisy flipped pictures with marks 0 to 120 mm off a
 * centre line were placed mirrored (the verifier's sweep, 1.5 px noise), and
 * 5 of 100,000 in this repo's sweep, all within 15 mm of the long line. At 4
 * both sweeps place 0 of 200,000 (tests/room-frame.test.ts with
 * ROOM_SWEEP=2000). The cost, accepted: a true picture whose two marks are
 * both within about 40 mm of a centre line is held provisional (of 2,000 each:
 * 0 mm 0 placed, 20 mm 0, 40 mm 285, 60 mm 1,925); the two standard cases of
 * the placement tests hold none (195 and 193 of 200 placed, as before). */
export const MIRROR_MARGIN = 4;

/** Place one picture in the room's frame from its anchors, or say why not.
 * `name` is the picture's ("Picture 2"). A picture is placed only when two
 * shared points, at different places on the floor, choose the same turn,
 * none disagrees with it beyond the bars, and no two choose differently. One
 * point is never enough: a spot mistaken for its look-alike on the other
 * side of the sheet (the opposite corner of a room) fits the wrong turn
 * exactly, and nothing in two pictures and one point can show it. */
export function placeView(
  name: string,
  candidates: readonly Rigid[],
  anchors: readonly Anchor[],
  /** The reference's reflections onto itself (`reflections`). Never a
   * placement: rivals the shared points must rule out. */
  mirrors: readonly Rigid[] = [],
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
      text: `${name} is not on the plan yet. Mark in it two points that are also marked in pictures already on the plan.`,
    };
  const limit = limitFor(anchors.length),
    checks = anchors.map((a) => checkAnchor(candidates, a, limit)),
    refuse = (
      reason: "apart" | "contradiction" | "undecided" | "mirror",
      text: string,
    ): Placement => ({ state: "refused", reason, checks, text }),
    moved = (c: AnchorCheck, gap = c.gapMm, allowed = c.allowedMm) =>
      refuse(
        "apart",
        `${name} is not on the plan: ${c.name} lands ${mm(gap)} from where the plan puts it, and its error bars allow only ${mm(allowed)}. Either the sheet moved between pictures (take them again without touching it), or these are different spots (unmark the point in one picture and mark the right spot), or the reference's long and short sides are swapped in one picture (check the lengths written on the sheet's edges in each, and press Swap sides in the picture where they are wrong). ${sharers([c])}`,
      ),
    apart = checks.find((c) => c.verdict === "apart"),
    // Does a reflection of the sheet fit every shared point, by the same
    // test a turn must pass?
    fits = (t: Rigid) =>
      anchors.every((a) => {
        const at = applyRigid(t, a.here.at);
        return (
          inBars(
            { x: at.x - a.there.at.x, y: at.y - a.there.at.y },
            addCov(turnCov(t, a.here.cov), a.there.cov),
          ) <= limit
        );
      }),
    mirrored = mirrors.some(fits),
    turned = candidates.some((t) =>
      checks.every((c) => c.bars[t.turn] <= limit),
    ),
    // Two of the shared points are two places on the floor.
    apartEnough = anchors.some((p, i) =>
      anchors.some(
        (q, j) =>
          j > i &&
          inBars(
            { x: p.there.at.x - q.there.at.x, y: p.there.at.y - q.there.at.y },
            addCov(p.there.cov, q.there.cov),
          ) >=
            2 * limit,
      ),
    );
  // No turn fits the shared points and a reflection does: the likeliest
  // cause by far is a picture saved flipped left to right.
  if (mirrored && !turned && apartEnough)
    return refuse(
      "mirror",
      `${name} is not on the plan: its shared points fit only if the picture is turned over, so it appears to be a mirror image (flipped left to right), as some front cameras and apps save them. A mirror image cannot be used. Add the picture again unflipped. If it is not flipped, one of these marks is on the wrong spot: ${sharers(checks)}`,
    );
  if (apart) return moved(apart);
  const deciding = checks.filter((c) => c.verdict === "agrees"),
    other = deciding.find((c) => c.turn !== deciding[0].turn);
  if (other)
    return refuse(
      "contradiction",
      `${name} is not on the plan: ${deciding[0].name} and ${other.name} disagree about which way round the sheet lies, so one of them is not the same spot in every picture. ${sharers([deciding[0], other])}`,
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
  // Two of the deciding points must be two places on the floor: further
  // apart than their bars could put one point.
  const where = (c: AnchorCheck) => anchors[checks.indexOf(c)].there,
    first = deciding[0],
    second = deciding.find((c) => {
      const p = where(first),
        q = where(c);
      return (
        c !== first &&
        inBars(
          { x: p.at.x - q.at.x, y: p.at.y - q.at.y },
          addCov(p.cov, q.cov),
        ) >=
          2 * limit
      );
    }),
    suggests = `it lies ${TURNS[rigid.turn]} from how its own corners read`;
  // A reflection across a line through the sheet's middle leaves every point
  // on that line where it is. Shared points all on one such line fit a turn
  // and the mirror image alike, so they cannot rule the mirror image out.
  // "Cannot rule it out" is judged on where the two readings would put each
  // point, not on whether the mirror image happens to pass the test: noise
  // fails a true fit 1 time in 20, and that must not place a mirror image.
  const told = (m: Rigid) =>
    anchors.some((a) => {
      const p = applyRigid(rigid, a.here.at),
        q = applyRigid(m, a.here.at);
      return (
        inBars(
          { x: p.x - q.x, y: p.y - q.y },
          addCov(turnCov(rigid, a.here.cov), a.there.cov),
        ) >=
        MIRROR_MARGIN * limit
      );
    });
  if (second && !mirrors.every(told))
    return {
      state: "provisional",
      turn: rigid.turn,
      reason: "line",
      checks,
      text: `${name} is not on the plan yet. ${deciding.map((c) => c.name).join(" and ")} lie on a line through the middle of the sheet, so they cannot tell this picture from its mirror image (a picture flipped left to right). Mark a shared point well off that line.`,
    };
  if (!second)
    return {
      state: "provisional",
      turn: rigid.turn,
      reason: deciding.length === 1 ? "one" : "close",
      checks,
      text:
        deciding.length === 1
          ? `${name} is not on the plan yet. ${first.name} alone suggests ${suggests} (the pictures put it ${mm(first.gapMm)} apart, the bars allow ${mm(first.allowedMm)}), and one point cannot confirm that: a spot mistaken for its look-alike on the other side of the sheet, such as the opposite corner of the room, fits the other way round just as well. Mark a second shared point, away from the first.`
          : `${name} is not on the plan yet. ${deciding.map((c) => c.name).join(" and ")} suggest ${suggests}, but they are too close together for their bars to count as two points. Mark a shared point further from them.`,
    };
  return {
    state: "placed",
    rigid,
    checks,
    text: `${name} is on the plan, ${TURNS[rigid.turn]} from how its own corners read. ${first.name} and ${second.name} agree on that: the pictures put them ${mm(first.gapMm)} and ${mm(second.gapMm)} apart, and the bars allow ${mm(first.allowedMm)} and ${mm(second.allowedMm)}.`,
  };
}
