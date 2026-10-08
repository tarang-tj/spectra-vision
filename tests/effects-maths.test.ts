/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { ACCENTS, BLUE, LAVENDER, MINT, ramp, rgb } from "../src/gl/color";
import {
  arcOffset,
  catmullRom,
  clamp,
  emitRate,
  hash,
  nextAlive,
  noise,
  smoothPath,
  smoothstep,
  spawnChance,
} from "../src/gl/maths";
import { describeShaderError } from "../src/gl/shader";

describe("curve smoothing", () => {
  it("passes through the two middle control points", () => {
    expect(catmullRom(0, 2, 5, 9, 0)).toBeCloseTo(2, 10);
    expect(catmullRom(0, 2, 5, 9, 1)).toBeCloseTo(5, 10);
  });
  it("is exact on a straight, evenly spaced line", () => {
    for (const t of [0.1, 0.25, 0.5, 0.9])
      expect(catmullRom(0, 1, 2, 3, t)).toBeCloseTo(1 + t, 10);
  });
  it("smooths a path through every measured point and ends on the last", () => {
    const points = [0, 0, 1, 2, 3, 1, 4, 4],
      out = new Float32Array(64),
      n = smoothPath(points, 4, 4, out);
    expect(n).toBe(3 * 4 + 1);
    for (let i = 0; i < 4; i++) {
      expect(out[2 * i * 4]).toBeCloseTo(points[2 * i], 5);
      expect(out[2 * i * 4 + 1]).toBeCloseTo(points[2 * i + 1], 5);
    }
    // Between the first two points the curve stays near the segment.
    expect(out[2]).toBeGreaterThan(0);
    expect(out[2]).toBeLessThan(1);
  });
  it("handles one point, no points, and a full output buffer", () => {
    const out = new Float32Array(8);
    expect(smoothPath([], 0, 4, out)).toBe(0);
    expect(smoothPath([7, 9], 1, 4, out)).toBe(1);
    expect([out[0], out[1]]).toEqual([7, 9]);
    const many = Array.from({ length: 40 }, (_, i) => i);
    const n = smoothPath(many, 20, 4, out);
    expect(n).toBe(4);
    expect([out[6], out[7]]).toEqual([38, 39]);
  });
});

describe("noise and arcs", () => {
  it("hash is deterministic and stays in [0, 1)", () => {
    for (let i = -50; i < 50; i++) {
      const h = hash(i * 0.37);
      expect(h).toBe(hash(i * 0.37));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
  it("noise is continuous and bounded", () => {
    for (let x = 0; x < 6; x += 0.05) {
      expect(Math.abs(noise(x, 3))).toBeLessThanOrEqual(1);
      expect(Math.abs(noise(x + 0.001, 3) - noise(x, 3))).toBeLessThan(0.01);
    }
  });
  it("an arc is pinned to both tracked points and bounded between", () => {
    for (const time of [0, 0.4, 3.7]) {
      expect(arcOffset(0, 5, time)).toBeCloseTo(0, 10);
      expect(arcOffset(1, 5, time)).toBeCloseTo(0, 10);
      for (let t = 0; t <= 1; t += 0.05)
        expect(Math.abs(arcOffset(t, 5, time))).toBeLessThanOrEqual(1);
    }
  });
  it("an arc moves with time and differs by seed", () => {
    expect(arcOffset(0.5, 1, 0)).not.toBe(arcOffset(0.5, 1, 0.5));
    expect(arcOffset(0.5, 1, 0)).not.toBe(arcOffset(0.5, 2, 0));
    expect(arcOffset(0.5, 1, 2)).toBe(arcOffset(0.5, 1, 2));
  });
});

describe("particle emit rates", () => {
  it("sheds a trickle at rest, more with speed, and never past the cap", () => {
    expect(emitRate(0, 100, 1000, 800)).toBe(100);
    expect(emitRate(0.3, 100, 1000, 800)).toBe(400);
    expect(emitRate(5, 100, 1000, 800)).toBe(800);
    expect(emitRate(-2, 100, 1000, 800)).toBe(100);
  });
  it("turns a rate into a per-particle birth chance", () => {
    // 600 births per second for 1/30 s is 20 births among 1000 dead.
    expect(spawnChance(600, 1 / 30, 1000, 0)).toBeCloseTo(0.02, 10);
    expect(spawnChance(600, 1 / 30, 1000, 900)).toBeCloseTo(0.2, 10);
    expect(spawnChance(1e9, 1, 1000, 0)).toBe(1);
    expect(spawnChance(0, 1 / 30, 1000, 0)).toBe(0);
    expect(spawnChance(600, 1 / 30, 1000, 5000)).toBeLessThanOrEqual(1);
  });
  it("estimates the living count: it settles at rate times mean life", () => {
    let alive = 0;
    for (let i = 0; i < 2000; i++)
      alive = nextAlive(alive, 500, 1 / 30, 2, 5000);
    expect(alive).toBeCloseTo(1000, 0);
    for (let i = 0; i < 2000; i++) alive = nextAlive(alive, 0, 1 / 30, 2, 5000);
    expect(alive).toBeLessThan(1);
    expect(nextAlive(10, 1e9, 1, 2, 5000)).toBe(5000);
  });
});

describe("colour", () => {
  it("reads the design tokens", () => {
    expect(rgb("#a4ffd9").map((v) => Math.round(v * 255))).toEqual([
      164, 255, 217,
    ]);
    expect(MINT).toEqual(rgb("a4ffd9"));
    expect(ACCENTS).toEqual([MINT, BLUE, LAVENDER]);
    expect(rgb("nonsense")).toEqual([1, 1, 1]);
  });
  it("ramps hit their stops and interpolate between them", () => {
    const out = [0, 0, 0],
      stops = [MINT, BLUE, LAVENDER];
    expect(ramp(stops, 0, out)).toEqual([...MINT]);
    expect(ramp(stops, 0.5, out)).toEqual([...BLUE]);
    expect(ramp(stops, 1, out)).toEqual([...LAVENDER]);
    expect(ramp(stops, 7, out)).toEqual([...LAVENDER]);
    ramp(stops, 0.25, out);
    for (let c = 0; c < 3; c++)
      expect(out[c]).toBeCloseTo((MINT[c] + BLUE[c]) / 2, 10);
  });
  it("clamp and smoothstep behave at the edges", () => {
    expect([clamp(-1), clamp(0.3), clamp(4), clamp(5, 2, 3)]).toEqual([
      0, 0.3, 1, 3,
    ]);
    expect([
      smoothstep(0, 1, -1),
      smoothstep(0, 1, 0.5),
      smoothstep(0, 1, 2),
    ]).toEqual([0, 0.5, 1]);
  });
});

describe("shader errors", () => {
  it("names the shader and quotes the source lines the driver points at", () => {
    const source = "#version 300 es\nvoid main() {\n  float x = y;\n}\n",
      text = describeShaderError(
        "glow lines",
        "fragment",
        "ERROR: 0:3: 'y' : undeclared identifier",
        source,
      );
    expect(text).toContain('Shader "glow lines" (fragment) failed');
    expect(text).toContain("undeclared identifier");
    expect(text).toContain("   3 |   float x = y;");
    expect(text).toContain("   2 | void main() {");
  });
  it("still says something when the driver gives no log", () => {
    expect(describeShaderError("a", "vertex", "", "x")).toContain(
      "the driver gave no log",
    );
  });
});
