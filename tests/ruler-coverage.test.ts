/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// How often the 2 sd bar really holds the true length. 300 seeded rooms, each
// with its own camera (height, tilt, focal length), sheet angles and noisy
// taps; every tapped point is moved by the tap uncertainty and the typed
// length by the tape uncertainty, as a real person's would be. Two standard
// deviations of a Gaussian would hold the truth about 95% of the time.
import { describe, it, expect } from "vitest";
import {
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
  normal,
  SHOT,
  SPANS,
  SPAN_MM,
  uniform,
  type P,
} from "./fixtures/ruler-accuracy-scene";

const SCENES = 300,
  BANDS = ["near", "middle", "far"] as const,
  median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];

function room(seed: number): Setup {
  const u = uniform(seed * 2654435761),
    g = normal(u);
  return {
    shot: {
      ...SHOT,
      up: 1300 + 400 * u(),
      tilt: ((30 + 10 * u()) * Math.PI) / 180,
      f: 1200 + 200 * u(),
    },
    turn1: Math.PI * u(),
    turn2: Math.PI * u(),
    tap: (p: P) => ({ x: p.x + SIGMA_PX * g(), y: p.y + SIGMA_PX * g() }),
    tapeMm: KNOWN_MM + TAPE_SD_MM * g(),
  };
}

type Band = {
  n: number;
  inside: number;
  off: number[];
  bar: number[];
  /** Signed error over one sd of the bar: sd 1 if the bar is exact. */
  z: number[];
};
function coverage(use: Use) {
  const out = Object.fromEntries(
    BANDS.map((b) => [b, { n: 0, inside: 0, off: [], bar: [], z: [] } as Band]),
  );
  let unusable = 0;
  for (let seed = 1; seed <= SCENES; seed++) {
    const setup = room(seed),
      f = solveScene(setup, use);
    for (const b of BANDS) {
      const s = f ? readSpan(setup, f, SPANS[b]) : null;
      // "Not measured" is shown as such; it is neither a hit nor a miss.
      if (!s) {
        unusable++;
        continue;
      }
      const band = out[b],
        off = Math.abs(s.mm - SPAN_MM);
      band.n++;
      if (off <= s.errorMm) band.inside++;
      band.off.push(off);
      band.bar.push(s.errorMm);
      band.z.push((s.mm - SPAN_MM) / (s.errorMm / 2));
    }
  }
  return { out, unusable };
}

// 95% is what 2 sd of a Gaussian gives. With 300 rooms the count itself
// scatters by about 1.3 points, so a share under 92% is under-cover. The
// floor of each case is what was measured, less that scatter; the panel's
// wording quotes the same figures (COVERAGE_NOTE in monte-carlo.ts).
const CASES: [string, Use, number][] = [
  ["one reference", { second: false, known: false }, 0.92],
  ["second sheet", { second: true, known: false }, 0.92],
  // The finding: one sheet and one typed length under-cover (94%, 93% and
  // 91% near, middle and far). The bar is not widened to hide it; the basis
  // sentence says so instead.
  ["known 3 m span", { second: false, known: true }, 0.88],
  ["second sheet and known span", { second: true, known: true }, 0.92],
];

describe("coverage of the 2 sd bar over 300 simulated rooms", () => {
  it.each(CASES)(
    "%s: how often the true length is inside the bar",
    (name, use, floor) => {
      const { out, unusable } = coverage(use);
      for (const b of BANDS) {
        const band = out[b],
          share = band.inside / band.n;
        record(
          `coverage, ${name}, ${b}: ${band.inside} of ${band.n} inside (${(100 * share).toFixed(1)}%), median error ${median(band.off).toFixed(0)} mm, median bar ${median(band.bar).toFixed(0)} mm, error over one sd of the bar has sd ${Math.sqrt(band.z.reduce((t, z) => t + z * z, 0) / band.n).toFixed(2)}`,
        );
        expect(share, `${name}, ${b}`).toBeGreaterThanOrEqual(floor);
        // Coverage must not be bought by refusing to measure.
        expect(band.n, `${name}, ${b}`).toBeGreaterThanOrEqual(0.9 * SCENES);
      }
      record(`coverage, ${name}: ${unusable} readings not measured`);
      // The under-cover case must stay named as one: if it starts to cover,
      // the wording that warns about it is out of date.
      if (floor < 0.92)
        expect(out.far.inside / out.far.n, "update COVERAGE_NOTE").toBeLessThan(
          0.95,
        );
    },
    300_000,
  );
});
