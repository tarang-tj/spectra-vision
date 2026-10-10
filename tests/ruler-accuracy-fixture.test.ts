/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The accuracy tests are only as good as the noise they add. This checks the
// fixture's own random numbers, which the coverage figures stand on.
import { describe, it, expect } from "vitest";
import {
  normal,
  rectangle,
  shoot,
  SHOT,
  uniform,
} from "./fixtures/ruler-accuracy-scene";

describe("the accuracy fixture", () => {
  it("draws uniform numbers over the whole of 0 to 1", () => {
    const u = uniform(777),
      n = 200_000;
    let sum = 0,
      sq = 0;
    for (let i = 0; i < n; i++) {
      const v = u();
      expect(v >= 0 && v < 1).toBe(true);
      sum += v;
      sq += v * v;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    expect(sq / n - (sum / n) ** 2).toBeCloseTo(1 / 12, 2);
  });

  it("draws standard normal numbers: mean 0, variance 1, also in short runs", () => {
    const g = normal(uniform(12345)),
      n = 200_000;
    let sum = 0,
      sq = 0,
      beyond2 = 0;
    for (let i = 0; i < n; i++) {
      const v = g();
      sum += v;
      sq += v * v;
      if (Math.abs(v) > 2) beyond2++;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.01);
    expect(sq / n).toBeCloseTo(1, 1);
    expect(beyond2 / n).toBeCloseTo(0.0455, 2);
    // Each simulated room uses the first few dozen numbers of its own seed.
    let s = 0,
      q = 0,
      c = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const short = normal(uniform(seed * 2654435761));
      for (let i = 0; i < 40; i++) {
        const v = short();
        s += v;
        q += v * v;
        c++;
      }
    }
    expect(Math.abs(s / c)).toBeLessThan(0.03);
    expect(q / c).toBeCloseTo(1, 1);
  });

  it("projects the floor as a pinhole camera does", () => {
    // Straight ahead on the optical axis: 1.5 m up, 35 degrees down.
    const ahead = SHOT.up / Math.tan(SHOT.tilt),
      centre = shoot(SHOT, { x: 0, y: ahead });
    expect(centre.x).toBeCloseTo(SHOT.w / 2, 9);
    expect(centre.y).toBeCloseTo(SHOT.h / 2, 9);
    // Further away is higher in the picture and smaller.
    const near = rectangle({ x: 0, y: 2000 }, 400, 200).map((p) =>
        shoot(SHOT, p),
      ),
      far = rectangle({ x: 0, y: 4000 }, 400, 200).map((p) => shoot(SHOT, p));
    expect(far[0].y).toBeLessThan(near[0].y);
    expect(far[1].x - far[0].x).toBeLessThan(near[1].x - near[0].x);
    // A point 1 m to the right at the axis distance: f * x / range.
    const range = Math.hypot(SHOT.up, ahead);
    expect(shoot(SHOT, { x: 1000, y: ahead }).x - SHOT.w / 2).toBeCloseTo(
      (SHOT.f * 1000) / range,
      6,
    );
  });
});
