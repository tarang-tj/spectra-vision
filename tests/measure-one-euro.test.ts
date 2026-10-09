/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  LandmarkSetSmoother,
  LandmarkSmoother,
  OneEuroFilter,
} from "../src/measure/one-euro";
import { describe as stats } from "../src/measure/series";

// A fixed pseudo-random jitter: the same every run.
const jitter = (i: number) =>
  Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;

describe("OneEuroFilter", () => {
  it("passes the first sample through and holds a constant signal", () => {
    const f = new OneEuroFilter();
    expect(f.filter(0.4, 0)).toBe(0.4);
    for (let t = 66; t < 1000; t += 66)
      expect(f.filter(0.4, t)).toBeCloseTo(0.4, 12);
  });

  it("steadies a still signal that jitters", () => {
    const f = new OneEuroFilter(),
      raw: number[] = [],
      out: number[] = [];
    for (let i = 0; i < 200; i++) {
      const v = 0.5 + 0.01 * jitter(i);
      raw.push(v);
      out.push(f.filter(v, i * 66));
    }
    expect(stats(out.slice(20)).sd).toBeLessThan(stats(raw.slice(20)).sd * 0.6);
  });

  it("follows a fast move almost at once", () => {
    const f = new OneEuroFilter();
    for (let i = 0; i < 20; i++) f.filter(0, i * 66);
    expect(f.filter(1, 20 * 66)).toBeGreaterThan(0.9);
  });

  it("lags a slow drift less than it smooths a still signal", () => {
    // A ramp of 0.1 per second must be tracked to within a small lag.
    const f = new OneEuroFilter();
    let last = 0;
    for (let i = 0; i < 100; i++) last = f.filter(i * 0.0066, i * 66);
    expect(Math.abs(last - 99 * 0.0066)).toBeLessThan(0.02);
  });

  it("starts again after a gap, and when time runs backwards", () => {
    const f = new OneEuroFilter({ maxGapMs: 500 });
    f.filter(0, 0);
    f.filter(0, 66);
    expect(f.filter(5, 10_000)).toBe(5);
    expect(f.filter(7, 9_000)).toBe(7);
  });

  it("returns the last output when time stands still and ignores non-finite input", () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    const a = f.filter(1, 66);
    expect(f.filter(99, 66)).toBe(a);
    expect(f.filter(NaN, 132)).toBeNaN();
    // The NaN left the state alone: the next sample continues from `a`.
    expect(f.filter(1, 132)).toBeGreaterThan(a - 1e-9);
  });

  it("reset forgets the history", () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    f.filter(0, 66);
    f.reset();
    expect(f.filter(3, 132)).toBe(3);
  });
});

const pts = (n: number, dx = 0) =>
  Array.from({ length: n }, (_, i) => ({
    x: i / n + dx,
    y: 0.5,
    z: -i,
    visibility: 0.9,
  }));

describe("LandmarkSmoother", () => {
  it("returns new points and never changes its input", () => {
    const s = new LandmarkSmoother(),
      input = pts(3);
    const frozen = JSON.stringify(input);
    s.smooth(input, 0);
    const out = s.smooth(pts(3, 0.01), 66);
    expect(JSON.stringify(input)).toBe(frozen);
    expect(out).toHaveLength(3);
    expect(out[0]).not.toBe(input[0]);
  });

  it("keeps visibility as given and filters z only where there is one", () => {
    const s = new LandmarkSmoother();
    s.smooth(
      [
        { x: 0, y: 0, z: 1, visibility: 0.2 },
        { x: 0, y: 0 },
      ],
      0,
    );
    const [a, b] = s.smooth(
      [
        { x: 0, y: 0, z: 2, visibility: 0.7 },
        { x: 0, y: 0 },
      ],
      66,
    );
    expect(a.visibility).toBe(0.7);
    expect(a.z).toBeGreaterThan(1);
    expect(a.z).toBeLessThan(2);
    expect("z" in b).toBe(false);
    expect("visibility" in b).toBe(false);
  });

  it("starts again when the number of points changes", () => {
    const s = new LandmarkSmoother();
    s.smooth(pts(3), 0);
    s.smooth(pts(3), 66);
    const out = s.smooth(pts(4, 0.3), 132);
    expect(out[0].x).toBe(0.3);
  });
});

describe("LandmarkSetSmoother", () => {
  it("restarts a list when its key changes, so two hands are never blended", () => {
    const s = new LandmarkSetSmoother();
    s.smooth([pts(2)], 0, ["Left"]);
    s.smooth([pts(2)], 66, ["Left"]);
    expect(s.smooth([pts(2, 0.5)], 132, ["Right"])[0][0].x).toBe(0.5);
    // Same key and a move below the slot-jump limit: it does smooth.
    expect(s.smooth([pts(2, 0.6)], 198, ["Right"])[0][0].x).toBeLessThan(0.6);
  });

  it("drops the state of lists that left and handles an empty frame", () => {
    const s = new LandmarkSetSmoother();
    s.smooth([pts(2), pts(2)], 0, ["Left", "Right"]);
    expect(s.smooth([], 66)).toEqual([]);
    // The right hand comes back as a fresh list: passes through.
    expect(
      s.smooth([pts(2, 0.4), pts(2, 0.4)], 132, ["Left", "Right"])[1][0].x,
    ).toBe(0.4);
  });
});

describe("LandmarkSetSmoother slots", () => {
  it("starts a slot again when its body jumps, and not for a small move", () => {
    const body = (x: number) => [
      { x, y: 0.5 },
      { x: x + 0.02, y: 0.6 },
    ];
    const f = new LandmarkSetSmoother({ minCutoff: 0.1, beta: 0 });
    for (let i = 0; i < 10; i++) f.smooth([body(0.2)], i * 66);
    // A 0.05 step is smoothed (heavily lagged), not passed through.
    const small = f.smooth([body(0.25)], 700)[0][0].x;
    expect(small).toBeLessThan(0.23);
    // Another person in the same slot, 0.5 away: no sliding, the new position.
    expect(f.smooth([body(0.75)], 766)[0][0].x).toBe(0.75);
  });
});
