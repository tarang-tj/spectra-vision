/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { landmarksFromAngles } from "../src/games/lib/pose-layout";
import * as pose from "../src/games/lib/pose-logic";
import { nextTarget, TARGETS } from "../src/games/lib/pose-targets";
import { createRng } from "../src/games/lib/round";
import type { Point } from "../src/vision/types";

const ASPECT = 1.6;
const byName = (name: string) => TARGETS.find((t) => t.name === name)!;
/** Similarity of a set of landmarks to a target, the way the game measures it. */
function measure(points: Point[], target: ArrayLike<number>, aspect = ASPECT) {
  const angles = new Float32Array(pose.JOINTS),
    has = new Array<boolean>(pose.JOINTS).fill(false);
  pose.poseAngles(points, aspect, angles, has);
  return pose.similarity(angles, has, target);
}
/** The person seen in a mirror: x flips and the model's left and right swap. */
function reflect(points: Point[]) {
  const out = points.map((p) => ({ ...p, x: 1 - p.x }));
  for (const [l, r] of [
    [11, 12],
    [13, 14],
    [15, 16],
    [23, 24],
    [25, 26],
    [27, 28],
  ])
    [out[l], out[r]] = [out[r], out[l]];
  return out;
}

describe("joint-angle pose similarity", () => {
  it("scores a pose against itself as 1 for every target", () => {
    for (const target of TARGETS) {
      const points = landmarksFromAngles(target.angles, 0.5, 0.3, 0.16, ASPECT);
      expect(measure(points, target.angles)).toBeCloseTo(1, 4);
    }
  });
  it("does not change with position, scale or the image aspect", () => {
    const target = byName("Goalpost").angles;
    for (const [cx, cy, unit, aspect] of [
      [0.5, 0.3, 0.16, 1.6],
      [0.2, 0.5, 0.05, 1.6],
      [0.8, 0.2, 0.3, 1.6],
      [0.4, 0.4, 0.12, 0.5625],
    ])
      expect(
        measure(
          landmarksFromAngles(target, cx, cy, unit, aspect),
          target,
          aspect,
        ),
      ).toBeCloseTo(1, 4);
  });
  it("does not change when the whole body leans", () => {
    const target = byName("T pose").angles,
      points = landmarksFromAngles(target, 0.5, 0.4, 0.16, 1),
      lean = 0.35,
      leaning = points.map((p) => ({
        ...p,
        x: 0.5 + (p.x - 0.5) * Math.cos(lean) - (p.y - 0.4) * Math.sin(lean),
        y: 0.4 + (p.x - 0.5) * Math.sin(lean) + (p.y - 0.4) * Math.cos(lean),
      }));
    expect(measure(leaning, target, 1)).toBeCloseTo(1, 4);
  });
  it("tolerates mirroring: the mirrored body matches the mirrored target", () => {
    const target = byName("Disco"),
      points = landmarksFromAngles(target.angles, 0.5, 0.3, 0.16, ASPECT),
      mirrored = reflect(points);
    // Disco is lopsided, so the mirror image is a different pose...
    expect(measure(mirrored, target.angles)!).toBeLessThan(0.6);
    // ...which the game accepts through the mirrored target.
    expect(measure(mirrored, target.mirrored)).toBeCloseTo(1, 4);
    const twice = pose.mirrorAngles(
      target.mirrored,
      new Float32Array(pose.JOINTS),
    );
    expect(Array.from(twice)).toEqual(Array.from(target.angles));
  });
  it("separates different poses and falls off with the angle error", () => {
    const down = landmarksFromAngles(
      new Float32Array(pose.JOINTS),
      0.5,
      0.3,
      0.16,
      ASPECT,
    );
    for (const target of TARGETS)
      expect(measure(down, target.angles)!).toBeLessThan(pose.LOCK_AT);
    const t = byName("T pose").angles,
      off = (degrees: number) =>
        measure(
          landmarksFromAngles(
            t.map((a, i) => (i === 0 ? a + (degrees * Math.PI) / 180 : a)),
            0.5,
            0.3,
            0.16,
            ASPECT,
          ),
          t,
        )!;
    expect(off(10)).toBeGreaterThan(off(30));
    expect(off(30)).toBeGreaterThan(off(60));
    expect(off(15)).toBeGreaterThan(pose.LOCK_AT);
    expect(pose.jointScore(0, pose.TOLERANCE)).toBeCloseTo(0);
    // 179 and -179 degrees are two degrees apart, not 358.
    expect(pose.jointScore(3.124, -3.124)).toBeGreaterThan(0.95);
  });
  it("judges a seated player by the arms and nobody without arms in view", () => {
    const target = byName("Big Y").angles,
      points = landmarksFromAngles(target, 0.5, 0.3, 0.16, ASPECT),
      seated = points.map((p, i) => (i >= 23 ? { ...p, visibility: 0 } : p));
    expect(measure(seated, target)).toBeCloseTo(1, 4);
    const hidden = points.map((p, i) =>
      i >= 13 && i <= 16 ? { ...p, visibility: 0 } : p,
    );
    expect(measure(hidden, target)).toBeNull();
    expect(measure([], target)).toBeNull();
    // One arm out of view scores zero for that arm: hiding it is no match.
    const oneArm = points.map((p, i) =>
      i === 13 || i === 15 ? { ...p, visibility: 0 } : p,
    );
    expect(measure(oneArm, target)!).toBeLessThan(pose.LOCK_AT);
  });
});

describe("hold to lock", () => {
  it("locks after the hold time and not a frame earlier", () => {
    const hold = pose.createHold();
    let frames = 0;
    while (!pose.holdStep(hold, 0.9, 40)) frames++;
    expect((frames + 1) * 40).toBe(pose.HOLD_MS);
    expect(pose.holdProgress(hold)).toBe(1);
  });
  it("drains when the pose slips, so a pass through the pose never locks", () => {
    const hold = pose.createHold();
    for (let i = 0; i < 10; i++) pose.holdStep(hold, 0.9, 40);
    expect(pose.holdProgress(hold)).toBeCloseTo(0.5);
    pose.holdStep(hold, 0.5, 40);
    expect(hold.ms).toBe(320);
    pose.holdStep(hold, null, 40);
    expect(hold.ms).toBe(240);
    for (let i = 0; i < 5; i++) pose.holdStep(hold, 0.1, 40);
    expect(hold.ms).toBe(0);
    // Matching on and off, half the time, never fills the ring.
    let locked = false;
    for (let i = 0; i < 500; i++)
      locked ||= pose.holdStep(hold, i % 2 ? 0.9 : 0.2, 40);
    expect(locked).toBe(false);
  });
  it("pays more for a closer match and for a faster lock", () => {
    const at = (match: number) => {
      const hold = pose.createHold();
      while (!pose.holdStep(hold, match, 40));
      return hold;
    };
    expect(pose.lockPoints(at(pose.LOCK_AT), 0)).toBe(100);
    expect(pose.lockPoints(at(1), 0)).toBe(200);
    expect(pose.lockPoints(at(1), 1)).toBe(250);
    expect(pose.lockPoints(at(0.9), 0.5)).toBeGreaterThan(
      pose.lockPoints(at(0.8), 0.5),
    );
    expect(pose.poseTime(0)).toBe(8000);
    expect(pose.poseTime(1)).toBe(5000);
  });
});

describe("pose targets", () => {
  it("never repeats the pose just shown", () => {
    const rng = createRng(3);
    let previous = nextTarget(rng, -1);
    const seen = new Set([previous]);
    for (let i = 0; i < 300; i++) {
      const next = nextTarget(rng, previous);
      expect(next).not.toBe(previous);
      expect(TARGETS[next]).toBeDefined();
      seen.add(next);
      previous = next;
    }
    expect(seen.size).toBe(TARGETS.length);
  });
});
