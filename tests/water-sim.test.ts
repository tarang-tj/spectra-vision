/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { palmOf, pickHand } from "../src/effects/lib/water-hand";
import type { HandSample } from "../src/effects/lib/water-hand";
import {
  COOLDOWN,
  GRACE_S,
  GRAVITY,
  KEEP,
  createWater,
  stepWater,
} from "../src/effects/lib/water-sim";
import type { WaterState } from "../src/effects/lib/water-sim";
import type { Point } from "../src/vision/types";

const DT = 1 / 30,
  RECT = { x: 0, y: 0, w: 640, h: 480 };

/** A seeded linear congruential generator, so splashes repeat exactly. */
function lcg(seed = 7) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
const hand = (x: number, y: number, open: boolean, t: number): HandSample => ({
  x,
  y,
  size: 100,
  open,
  t,
  spread: open ? 1.9 : 1,
});

/** Step with an open palm at (x, y) until the blob is held. */
function summon(s: WaterState, random: () => number, x = 320, y = 200) {
  let t = 0;
  for (let i = 0; i < 8; i++)
    stepWater(s, hand(x, y, true, (t += 1000 * DT)), RECT, DT, random);
  return t;
}
/** Summon, then fling the palm right at 3000 px/s until the blob flies. */
function throwBlob(s: WaterState, random: () => number, y = 200) {
  let t = summon(s, random, 100, y),
    x = 100;
  for (let i = 0; i < 20 && s.phase === "held"; i++)
    stepWater(s, hand((x += 100), y, true, (t += 1000 * DT)), RECT, DT, random);
  return t;
}

describe("water simulation", () => {
  it("stays idle with no hand", () => {
    const s = createWater(),
      random = lcg();
    for (let i = 0; i < 60; i++) stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("idle");
  });
  it("fist never summons", () => {
    const s = createWater(),
      random = lcg();
    for (let i = 0; i < 60; i++)
      stepWater(s, hand(320, 200, false, i * 33), RECT, DT, random);
    expect(s.phase).toBe("idle");
  });
  it("open palm summons within 8 steps", () => {
    const s = createWater(),
      random = lcg();
    for (let i = 1; i < 8; i++) {
      stepWater(s, hand(320, 200, true, i * 33), RECT, DT, random);
      expect(s.phase).toBe("idle");
    }
    stepWater(s, hand(320, 200, true, 8 * 33), RECT, DT, random);
    expect(s.phase).toBe("held");
    expect(s.r).toBeCloseTo(60, 6);
  });
  it("held blob follows palm exactly", () => {
    const s = createWater(),
      random = lcg();
    let t = summon(s, random);
    for (let i = 0; i < 5; i++) {
      stepWater(
        s,
        hand(320 + i * 4, 200 - i * 3, true, (t += 33)),
        RECT,
        DT,
        random,
      );
      expect([s.phase, s.x, s.y]).toEqual(["held", 320 + i * 4, 200 - i * 3]);
    }
    expect(s.grow).toBeGreaterThan(0.4);
  });
  it("fast palm throws at 1.15x palm velocity", () => {
    const s = createWater(),
      random = lcg();
    throwBlob(s, random);
    expect(s.phase).toBe("flying");
    expect(s.hvx).toBeGreaterThan(700);
    expect(s.vx).toBeCloseTo(s.hvx * KEEP, 6);
    expect(s.vy).toBeCloseTo(0, 6);
  });
  it("gravity grows vy, vx constant", () => {
    const s = createWater(),
      random = lcg();
    throwBlob(s, random, 60);
    const vx = s.vx,
      vy = s.vy;
    stepWater(s, null, RECT, DT, random);
    stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("flying");
    expect(s.vx).toBe(vx);
    expect(s.vy).toBeCloseTo(vy + 2 * GRAVITY * RECT.h * DT, 3);
  });
  it("bottom hit splashes with drops and puddle", () => {
    const s = createWater(),
      random = lcg();
    summon(s, random, 320, 300);
    // Let go: after the grace period the blob drops.
    for (let i = 0; i < 20 && s.phase === "held"; i++)
      stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("flying");
    for (let i = 0; i < 60 && s.phase === "flying"; i++)
      stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("splash");
    expect(s.dropCount).toBeGreaterThan(0);
    expect(s.puddle.age).toBe(0);
    expect(s.puddle.y).toBe(RECT.h);
  });
  it("side exit splashes without puddle", () => {
    const s = createWater(),
      random = lcg();
    throwBlob(s, random, 60);
    for (let i = 0; i < 60 && s.phase === "flying"; i++)
      stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("splash");
    expect(s.x).toBeGreaterThan(RECT.w);
    expect(s.puddle.age).toBeLessThan(0);
  });
  it("expires to idle after cooldown", () => {
    const s = createWater(),
      random = lcg();
    summon(s, random, 320, 300);
    let steps = 0;
    while (s.phase !== "idle" && steps < 400) {
      stepWater(s, null, RECT, DT, random);
      steps++;
    }
    expect(s.phase).toBe("idle");
    expect(s.dropCount).toBe(0);
    expect(s.puddle.age).toBeLessThan(0);
    // The cooldown runs first, then the summon time starts.
    const wait = Math.ceil((COOLDOWN + 0.25) / DT) + 1;
    for (let i = 1; i < wait - 2; i++) {
      stepWater(s, hand(320, 200, true, 9000 + i * 33), RECT, DT, random);
      expect(s.phase).toBe("idle");
    }
    for (let i = 0; i < 4; i++)
      stepWater(s, hand(320, 200, true, 9900 + i * 33), RECT, DT, random);
    expect(s.phase).toBe("held");
  });
  it("dt 0 changes no phase", () => {
    const s = createWater(),
      random = lcg();
    for (let i = 0; i < 30; i++)
      stepWater(s, hand(320, 200, true, i * 33), RECT, 0, random);
    expect(s.phase).toBe("idle");
    throwBlob(s, random);
    const x = s.x;
    for (let i = 0; i < 30; i++) stepWater(s, null, RECT, 0, random);
    expect([s.phase, s.x]).toEqual(["flying", x]);
    // Paused while still growing: it follows the palm and keeps its size.
    const held = createWater();
    summon(held, random);
    const grow = held.grow;
    stepWater(held, hand(400, 250, false, 5000), RECT, 0, random);
    expect([held.phase, held.x, held.y, held.grow]).toEqual([
      "held",
      400,
      250,
      grow,
    ]);
  });
  it("a missed result holds, a lost hand drops the blob", () => {
    const s = createWater(),
      random = lcg();
    let t = summon(s, random);
    // One or two results without the hand are a model miss, not a release.
    stepWater(s, null, RECT, DT, random);
    stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("held");
    stepWater(s, hand(330, 200, true, (t += 100)), RECT, DT, random);
    expect([s.phase, s.timer]).toEqual(["held", 0]);
    const steps = Math.ceil(GRACE_S / DT);
    for (let i = 1; i < steps; i++) stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("held");
    stepWater(s, null, RECT, DT, random);
    expect(s.phase).toBe("flying");
    stepWater(s, null, RECT, DT, random);
    expect(s.vy).toBeGreaterThan(0);
  });
  it("reduced motion gathers a still ball that never flies", () => {
    const s = createWater(),
      random = lcg();
    let t = 0;
    for (let i = 0; i < 8; i++)
      stepWater(s, hand(320, 200, true, (t += 33)), RECT, 0, random, DT);
    expect([s.phase, s.grow]).toEqual(["held", 1]);
    // A fast palm moves the ball with it and does not throw it.
    for (let i = 0; i < 10; i++)
      stepWater(
        s,
        hand(320 + i * 150, 200, true, (t += 33)),
        RECT,
        0,
        random,
        DT,
      );
    expect([s.phase, s.x]).toEqual(["held", 320 + 9 * 150]);
    for (let i = 0; i < 10; i++) stepWater(s, null, RECT, 0, random, DT);
    expect([s.phase, s.dropCount]).toEqual(["idle", 0]);
  });
});

/** 21 landmarks of a hand standing up, wrist at the bottom. `reach` is how
 * far the fingertips sit from the wrist, in palm lengths. */
function landmarks(reach: number): Point[] {
  const points: Point[] = [],
    wrist = { x: 0.3, y: 0.8 },
    palm = 0.2;
  for (let i = 0; i < 21; i++) {
    const finger = Math.max(0, Math.ceil(i / 4) - 1),
      // The thumb stands well apart from the index finger, as in a palm.
      dx = finger === 0 ? -0.16 : (finger - 2) * 0.04,
      tip = i > 0 && i % 4 === 0,
      knuckle = i > 0 && i % 4 === 1,
      length = tip ? reach : knuckle ? 1 : 0.9 + (i % 4) * 0.1;
    points.push(
      i === 0 ? wrist : { x: wrist.x + dx, y: wrist.y - palm * length },
    );
  }
  return points;
}

describe("palmOf", () => {
  it("palmOf open and fist, mirrored and not", () => {
    const out = hand(0, 0, false, 0),
      rect = { x: 10, y: 20, w: 400, h: 300 };
    expect(palmOf(landmarks(1.9), rect, false, out, 123)).toBe(true);
    expect(out.open).toBe(true);
    expect(out.t).toBe(123);
    expect(out.size).toBeCloseTo(60, 6);
    const plainX = out.x;
    // Mean of the wrist (y 0.8) and four knuckles (y 0.6), in stage pixels.
    expect(out.y).toBeCloseTo(20 + 0.64 * 300, 6);
    expect(palmOf(landmarks(1.9), rect, true, out, 124)).toBe(true);
    expect(out.x).toBeCloseTo(rect.x + rect.w - (plainX - rect.x), 6);
    // Between the thresholds the last answer stands; below it, a fist.
    palmOf(landmarks(1.4), rect, false, out, 125);
    expect(out.open).toBe(true);
    palmOf(landmarks(0.9), rect, true, out, 126);
    expect(out.open).toBe(false);
    palmOf(landmarks(1.4), rect, false, out, 127);
    expect(out.open).toBe(false);
    expect(palmOf(landmarks(1.9).slice(0, 20), rect, false, out, 1)).toBe(
      false,
    );
  });
  it("an OK sign or a pinch is not an open palm", () => {
    const out = hand(0, 0, false, 0),
      rect = { x: 0, y: 0, w: 400, h: 300 },
      ok = landmarks(1.9);
    ok[4] = { ...ok[8] };
    expect(palmOf(ok, rect, false, out, 1)).toBe(true);
    expect([out.open, out.spread]).toEqual([false, 0]);
    expect(palmOf(landmarks(1.9), rect, false, out, 2)).toBe(true);
    expect(out.open).toBe(true);
  });
});

describe("pickHand", () => {
  const open = hand(100, 200, true, 0),
    other = hand(480, 200, true, 0),
    fist = hand(470, 220, false, 0);
  it("picks the most open hand when nothing is held", () => {
    expect(pickHand([fist, open], [true, true], 2, null, false)).toBe(1);
    expect(pickHand([fist, open], [true, false], 2, null, false)).toBe(0);
    expect(pickHand([fist, open], [false, false], 2, null, false)).toBe(-1);
  });
  it("keeps a held ball on the nearest hand within reach", () => {
    const ball = { x: 110, y: 205 };
    expect(pickHand([other, open], [true, true], 2, ball, false)).toBe(1);
  });
  it("ignores a far hand when the holding hand drops out", () => {
    // MediaPipe puts the remaining hand at index 0: not a flick, not a fist.
    const ball = { x: 110, y: 205 };
    expect(pickHand([other], [true], 1, ball, false)).toBe(-1);
    expect(pickHand([fist], [true], 1, ball, false)).toBe(-1);
    // Unless the mirror or the stage size just changed.
    expect(pickHand([other], [true], 1, ball, true)).toBe(0);
  });
});
