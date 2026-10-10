/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { solveFused } from "../src/panels/ruler/fused";
import { fusedRuns } from "../src/panels/ruler/fused-trials";
import {
  applyHomography,
  orderCorners,
  solveHomography,
  solveSheet,
  type Pt,
} from "../src/panels/ruler/homography";
import { measureSpan } from "../src/panels/ruler/monte-carlo";
import {
  exact,
  readSpan,
  record,
  SIGMA_PX,
  solveScene,
  TAPE_SD_MM,
  type Setup,
  type Use,
} from "./fixtures/ruler-accuracy-run";
import {
  KNOWN_MM,
  LETTER,
  normal,
  rectangle,
  SHEET_1,
  SHOT,
  shoot,
  SPANS,
  SPAN_MM,
  uniform,
  type P,
} from "./fixtures/ruler-accuracy-scene";

const ONE: Use = { second: false, known: false },
  SECOND: Use = { second: true, known: false },
  KNOWN_SPAN: Use = { second: false, known: true },
  median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];

/** The fixed room with one seeded set of noisy taps. */
function noisy(seed: number): Setup {
  const g = normal(uniform(seed));
  return {
    ...exact(SHOT),
    tap: (p: P) => ({ x: p.x + SIGMA_PX * g(), y: p.y + SIGMA_PX * g() }),
    tapeMm: KNOWN_MM + TAPE_SD_MM * g(),
  };
}

describe("the fused plane solve", () => {
  it("with only the first reference equals the four-point solve", () => {
    const taps: Pt[] = orderCorners(
        rectangle(SHEET_1, LETTER.long, LETTER.short, 0.3).map((p) => ({
          ...shoot(SHOT, p),
          s: SIGMA_PX,
        })),
      ),
      sheet = solveSheet(taps, LETTER.long, LETTER.short, false)!,
      old = solveHomography(taps, sheet.plane)!,
      fused = solveFused({
        first: { taps, plane: sheet.plane },
        rects: [],
        spans: [],
        sigmaPx: SIGMA_PX,
        tapeSigmaMm: TAPE_SD_MM,
      })!;
    expect(fused.chi).toBe(0);
    // The same map: a point far across the room lands in the same place.
    for (const p of [...SPANS.far, ...SPANS.near].map((q) => shoot(SHOT, q))) {
      const a = applyHomography(old, p)!,
        b = applyHomography(fused.h, p)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
    }
    fused.h.forEach((v, i) =>
      expect(Math.abs(v - old[i])).toBeLessThan(1e-9 * (1 + Math.abs(old[i]))),
    );
    // And the panel's path leaves the sheet, and so every bar, untouched.
    const setup = exact(SHOT),
      f = solveScene(setup, ONE)!;
    expect(f.sheet.fused).toBeUndefined();
    const plain = solveSheet(
        f.sheet.ordered,
        LETTER.long,
        LETTER.short,
        false,
        f.sheet.firstIsLong,
      )!,
      [a, b] = SPANS.near.map((q) => ({ ...shoot(SHOT, q), s: SIGMA_PX }));
    expect(readSpan(setup, f, SPANS.near)).toEqual(
      measureSpan({ ...plain, raw: f.sheet.ordered }, a, b, SIGMA_PX, "mm"),
    );
  });

  it("recovers exact truth from exact taps, with residual zero", () => {
    for (const use of [SECOND, KNOWN_SPAN, { second: true, known: true }]) {
      const setup = exact(SHOT),
        f = solveScene(setup, use)!;
      expect(f.note).toBeNull();
      expect(f.sheet.fused!.chi).toBeLessThan(1e-6);
      expect(readSpan(setup, f, SPANS.far)!.mm).toBeCloseTo(SPAN_MM, 4);
    }
  });

  it("a second sheet or a known 3 m span tightens the far span", () => {
    const N = 60,
      stats = (use: Use) => {
        const off: number[] = [],
          bar: number[] = [];
        for (let seed = 1; seed <= N; seed++) {
          const setup = noisy(seed * 7919),
            s = readSpan(setup, solveScene(setup, use)!, SPANS.far);
          if (!s) continue;
          off.push(Math.abs(s.mm - SPAN_MM));
          bar.push(s.errorMm);
        }
        return { n: off.length, off: median(off), bar: median(bar) };
      },
      one = stats(ONE),
      second = stats(SECOND),
      known = stats(KNOWN_SPAN);
    // Median of 60 noisy retakes of the fixed room, 1 m far span. The report
    // states the numbers; these margins are well inside them.
    for (const [name, s] of Object.entries({ one, second, known }))
      record(
        `far span, ${name}: median error ${s.off.toFixed(0)} mm, median bar ${s.bar.toFixed(0)} mm (n=${s.n})`,
      );
    expect(second.off).toBeLessThan(one.off / 3);
    expect(second.bar).toBeLessThan(one.bar / 5);
    expect(known.off).toBeLessThan(one.off / 2);
    expect(known.bar).toBeLessThan(one.bar / 3);
  }, 120_000);

  it("makes the retakes once and shares them between measurements", () => {
    // Its own room, so nothing an earlier test solved is reused.
    const setup = { ...exact(SHOT), turn1: 0.7, turn2: 0.2 },
      t0 = performance.now(),
      f = solveScene(setup, { second: true, known: true })!,
      first = readSpan(setup, f, SPANS.far)!,
      cold = performance.now() - t0,
      runs = f.sheet.fused!.runs,
      t1 = performance.now(),
      next = readSpan(setup, f, SPANS.middle)!,
      warm = performance.now() - t1;
    expect(first.kept).toBe(1);
    expect(next.kept).toBe(1);
    expect(runs.length).toBe(400);
    // The second span reused the same 400 retakes: none were added.
    expect(f.sheet.fused!.runs).toBe(runs);
    expect(fusedRuns(f.sheet.fused!, 200)).toEqual(runs.slice(0, 200));
    // The same known sizes again give the same solve object and its runs.
    expect(solveScene(setup, { second: true, known: true })!.sheet.fused).toBe(
      f.sheet.fused,
    );
    record(
      `timing, two references and one known span: first result ${cold.toFixed(1)} ms, next ${warm.toFixed(2)} ms`,
    );
    // Generous: this is a guard against a blow-up, not the measurement.
    expect(cold).toBeLessThan(1500);
    expect(warm).toBeLessThan(cold);
  });

  it("a known span that contradicts the reference is called out", () => {
    const wrong = { ...exact(SHOT), tapeMm: KNOWN_MM * 1.5 },
      f = solveScene(wrong, { second: true, known: true })!;
    expect(f.note).toMatch(/disagree by [\d.]+ times what tap error explains/);
    // Honest noisy taps do not trip it.
    let tripped = 0;
    for (let seed = 1; seed <= 40; seed++)
      if (solveScene(noisy(seed * 104729), { second: true, known: true })!.note)
        tripped++;
    expect(tripped).toBeLessThanOrEqual(1);
  });
});
