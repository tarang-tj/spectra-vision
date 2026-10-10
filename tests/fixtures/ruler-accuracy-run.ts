/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Runs the Ruler's own solve on a scene from ruler-accuracy-scene.ts, the way
// the panel does: tap the first sheet, optionally a second sheet and a known
// span, then read spans. The scene and its truth come from the fixture; only
// the measuring is the code under test.
import { fuseSheet, type Fusion } from "../../src/panels/ruler/fuse-inputs";
import {
  orderCorners,
  solveSheet,
  type Pt,
} from "../../src/panels/ruler/homography";
import { measureSpan, type Span } from "../../src/panels/ruler/monte-carlo";
import {
  KNOWN,
  KNOWN_MM,
  LETTER,
  rectangle,
  SHEET_1,
  SHEET_2,
  shoot,
  type P,
  type Shot,
} from "./ruler-accuracy-scene";

export const SIGMA_PX = 1.5;
export const TAPE_SD_MM = 2;

export type Setup = {
  shot: Shot;
  /** How each sheet is turned on the floor. */
  turn1: number;
  turn2: number;
  /** A tap at a true picture point: the identity, or the point plus noise. */
  tap: (p: P) => P;
  /** What the tape read for the known span. */
  tapeMm: number;
};
export type Use = { second: boolean; known: boolean };

/** Null when the taps do not give a usable first reference. */
export function solveScene(setup: Setup, use: Use): Fusion | null {
  const { shot, tap } = setup,
    stamp = (p: P): Pt => ({ ...tap(shoot(shot, p)), s: SIGMA_PX }),
    taps = rectangle(SHEET_1, LETTER.long, LETTER.short, setup.turn1).map(
      stamp,
    ),
    ordered = orderCorners(taps),
    // A person fixes a wrong long-side guess with Swap sides; here the truth
    // says which tapped edge is the long one (corners 0-1 and 2-3 of the
    // rectangle as built).
    which = (p: Pt) => taps.indexOf(p),
    i = which(ordered[0]),
    j = which(ordered[1]),
    firstIsLong = Math.min(i, j) % 2 === 0 && Math.abs(i - j) === 1,
    sheet = solveSheet(ordered, LETTER.long, LETTER.short, false, firstIsLong);
  if (!sheet) return null;
  return fuseSheet(
    { ...sheet, raw: ordered },
    null,
    use.second
      ? [
          {
            corners: rectangle(
              SHEET_2,
              LETTER.long,
              LETTER.short,
              setup.turn2,
            ).map(stamp),
            ...LETTER,
          },
        ]
      : [],
    use.known ? [{ a: stamp(KNOWN[0]), b: stamp(KNOWN[1]), mm: setup.tapeMm }] : [],
    SIGMA_PX,
    TAPE_SD_MM,
  );
}

/** One span through a solved scene, in mm. */
export function readSpan(setup: Setup, f: Fusion, ends: [P, P]): Span | null {
  const stamp = (p: P): Pt => ({
    ...setup.tap(shoot(setup.shot, p)),
    s: SIGMA_PX,
  });
  return measureSpan(f.sheet, stamp(ends[0]), stamp(ends[1]), SIGMA_PX, "mm");
}

export const exact = (shot: Shot): Setup => ({
  shot,
  turn1: 0.3,
  turn2: 1.1,
  tap: (p) => p,
  tapeMm: KNOWN_MM,
});
