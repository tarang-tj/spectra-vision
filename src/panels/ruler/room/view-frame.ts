/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One picture's own floor map, with its simulated retakes, from what was
// tapped on it. The retakes depend only on that picture's taps and on its id,
// so they are made once and kept with the view: switching pictures does not
// make them again. Each picture has its own random stream, so the retakes of
// two pictures are independent of each other, as two real photos are.
import { derive, type Derived } from "../derive";
import { fusedRuns } from "../fused-trials";
import { solveHomography, type Mat3, type Pt } from "../homography";
import {
  gaussian,
  makeJitter,
  seededRandom,
  TAP_SIGMA_SCREEN_PX,
} from "../monte-carlo";
import type { RulerState } from "../state";
import type { Unit } from "../units";
import type { ViewFrame } from "./room-merge";
import type { ViewSnap } from "./views-store";

/** Simulated retakes per picture, as for Box and Walls. */
export const ROOM_TRIALS = 200;
const ROOM_SEED = 0x5eed0a11;

/** The Ruler state a view's snapshot stands for, for the Ruler's own solve. */
export const stateOf = (snap: ViewSnap): RulerState => ({
  ...snap.ruler,
  ...snap.known,
  tool: "span",
  unit: "mm",
  generation: null,
  lock: null,
  grab: null,
});

const solves = new WeakMap<ViewSnap, Map<Unit, Solved>>();
export type Solved = { s: RulerState; d: Derived };
/** The Ruler's own solve of one picture, with its numbers in `unit`. Kept
 * per snapshot: the Ruler remembers one solve at a time, the one on the
 * stage, and asking it about another picture every drawn frame would make it
 * forget that one each time. */
export function solved(snap: ViewSnap, unit: Unit = "mm"): Solved {
  let byUnit = solves.get(snap);
  if (!byUnit) solves.set(snap, (byUnit = new Map()));
  let hit = byUnit.get(unit);
  if (!hit) {
    const s = { ...stateOf(snap), unit };
    byUnit.set(unit, (hit = { s, d: derive(s) }));
  }
  return hit;
}

/** 0..n-1 in an order fixed by `seed` (Fisher-Yates). */
function shuffled(n: number, seed: number): number[] {
  const r = seededRandom(seed),
    out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const memo = new Map<number, { key: string; frame: ViewFrame | null }>();
const points = (ps: readonly Pt[]) =>
  ps.map((p) => `${p.x},${p.y},${p.s ?? ""}`).join(";");

/** The frame of view `id`, or null until its reference is solved. Kept per
 * view on the values it depends on, so a span dragged or a box moved in that
 * picture does not make its retakes again. */
export function frameOf(
  id: number,
  snap: ViewSnap,
  n = ROOM_TRIALS,
): ViewFrame | null {
  const { s, d } = solved(snap),
    { sheet, lens } = d;
  if (!sheet) {
    memo.delete(id);
    return null;
  }
  const sigma = TAP_SIGMA_SCREEN_PX / (s.scale > 0 ? s.scale : 1),
    base = sheet.raw ?? sheet.ordered,
    key = [
      points(base),
      points(sheet.plane),
      sheet.h.join(","),
      sheet.fused?.key ?? "",
      lens ? `${lens.k}|${lens.cx}|${lens.cy}|${lens.norm}` : "",
      sigma,
      n,
    ].join("#"),
    hit = memo.get(id);
  if (hit && hit.key === key) return hit.frame;
  const seed = (ROOM_SEED + id * 7919) >>> 0;
  let trials: (Mat3 | null)[];
  if (sheet.fused) {
    // Retakes of the whole fused solve. They come from one stream whatever
    // the picture, so each picture takes them in its own order.
    const runs = fusedRuns(sheet.fused, n);
    trials = shuffled(n, seed).map((i) => runs[i]?.h ?? null);
  } else {
    const jitter = makeJitter(gaussian(seededRandom(seed)), sigma, lens);
    trials = Array.from({ length: n }, () =>
      solveHomography(base.map(jitter), sheet.plane),
    );
  }
  const frame: ViewFrame = {
    id,
    plane: sheet.plane,
    h: sheet.h,
    lens,
    sigma,
    trials,
  };
  memo.set(id, { key, frame });
  return frame;
}
/** Forget every kept frame (tests, and a room that was closed). */
export const dropFrames = () => memo.clear();
