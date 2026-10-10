/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Simulated retakes of the fused solve. Each one moves every tapped point of
// every known size by its tap uncertainty and every typed length by the tape
// uncertainty, then solves the one plane map again, starting from the answer
// the real taps gave. The runs do not depend on what is being measured, so
// they are made once per set of known sizes and shared by every span, path,
// outline and camera trial. Seeded: the same taps give the same runs.
import {
  solveFused,
  type FuseInput,
  type FuseRect,
  type FuseStart,
} from "./fused";
import type { Mat3, Pt } from "./homography";
import { applyLens, type Lens } from "./lens";
// (monte-carlo.ts imports this file too; both use the other only inside
// functions, so the cycle is harmless.)
import { gaussian, seededRandom } from "./monte-carlo";

/** One retake: its plane map and where it puts the first reference's corners
 * in the picture (flat pixels). */
export type FusedRun = { h: Mat3; corners: Pt[] };

/** The fused solve of the real taps, with what is needed to repeat it. */
export type Fused = {
  /** Identifies every input, for the measurement caches. */
  key: string;
  h: Mat3;
  /** The first reference's corners as the fused map sees them (flat pixels). */
  corners: Pt[];
  chi: number;
  spare: number;
  /** Counts of what went in beyond the first reference. */
  rects: number;
  spans: number;
  tapeSigmaMm: number;
  /** Tapped points before the lens correction, and the nominal answer. */
  raw: FuseInput;
  lens: Lens | null;
  start: FuseStart;
  /** Runs made so far (null where a retake gave no surface). */
  runs: (FusedRun | null)[];
};

/** Kept apart from the seed of a measurement's own end points. */
const FUSED_SEED = 0x5eed1e55;
const TRIAL_ITERATIONS = 40;
/** A retake stops once a step moves no unknown by more than this (the
 * unknowns are scaled to order one). */
const TRIAL_TOLERANCE = 1e-6;

/** The last solve, so a state change that leaves the known sizes alone (a
 * measured point dragged, a unit changed) keeps its runs. */
let last: Fused | null = null;

/** One solve of points as tapped (the lens correction is applied here). */
export function fuseOnce(raw: FuseInput, lens: Lens | null) {
  const flat = (p: Pt) => applyLens(lens, p),
    rect = (r: FuseRect): FuseRect => ({ ...r, taps: r.taps.map(flat) });
  return solveFused({
    ...raw,
    first: rect(raw.first),
    rects: raw.rects.map(rect),
    spans: raw.spans.map((s) => ({ ...s, a: flat(s.a), b: flat(s.b) })),
  });
}

/** Solve the real taps. `raw` holds points as tapped; the lens correction is
 * applied here, as it is to every other point. Null when they do not fuse. */
export function makeFused(raw: FuseInput, lens: Lens | null): Fused | null {
  const pt = (p: Pt) => `${p.x},${p.y},${p.s ?? ""}`,
    rk = (r: FuseRect) =>
      [...r.taps.map(pt), ...r.plane.map((c) => `${c.x},${c.y}`)].join(";"),
    key = [
      rk(raw.first),
      ...raw.rects.map(rk),
      ...raw.spans.map((s) => `${pt(s.a)};${pt(s.b)};${s.mm}`),
      raw.sigmaPx,
      raw.tapeSigmaMm,
      lens ? `${lens.k}|${lens.cx}|${lens.cy}` : "",
    ].join("/");
  if (last && last.key === key) return last;
  const solved = fuseOnce(raw, lens);
  if (!solved) return null;
  return (last = {
    key,
    h: solved.h,
    corners: solved.corners,
    chi: solved.chi,
    spare: solved.spare,
    rects: raw.rects.length,
    spans: raw.spans.length,
    tapeSigmaMm: raw.tapeSigmaMm,
    raw,
    lens,
    start: solved.start,
    runs: [],
  });
}

/** The first `n` retakes. Later calls reuse earlier runs, and a shorter list
 * is the start of a longer one. */
export function fusedRuns(f: Fused, n: number): (FusedRun | null)[] {
  for (let i = f.runs.length; i < n; i++) {
    // Each retake has its own stream, so run i is the same however many are
    // asked for.
    const normal = gaussian(seededRandom(FUSED_SEED + i * 7919)),
      { raw, lens } = f,
      move = (p: Pt): Pt => {
        const s = p.s ?? raw.sigmaPx,
          q = applyLens(lens, {
            x: p.x + s * normal(),
            y: p.y + s * normal(),
          });
        return { x: q.x, y: q.y, s };
      },
      rect = (r: FuseRect): FuseRect => ({ ...r, taps: r.taps.map(move) }),
      trial: FuseInput = {
        ...raw,
        first: rect(raw.first),
        rects: raw.rects.map(rect),
        spans: raw.spans.map((s) => ({
          a: move(s.a),
          b: move(s.b),
          mm: s.mm + raw.tapeSigmaMm * normal(),
        })),
      },
      solved = solveFused(trial, f.start, TRIAL_ITERATIONS, TRIAL_TOLERANCE);
    f.runs.push(solved ? { h: solved.h, corners: solved.corners } : null);
  }
  return f.runs.length === n ? f.runs : f.runs.slice(0, n);
}
