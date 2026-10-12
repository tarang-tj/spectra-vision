/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TRACKER,
  STEADY_TRACKER,
  Tracker,
} from "../src/vision/tracker";
import type { Detection } from "../src/vision/types";

const det = (x: number, score = 0.8): Detection => ({
  label: "person",
  score,
  box: { x, y: 0.3, w: 0.1, h: 0.2 },
});
const GAP = 66;

describe("a confirmed track that a result misses", () => {
  it("is returned as held, with its id, and is found again under the same id", () => {
    const t = new Tracker(STEADY_TRACKER);
    for (let i = 0; i < 5; i++) t.update([det(0.4)], i * GAP);
    for (const i of [5, 6]) {
      const out = t.update([], i * GAP);
      expect(out).toMatchObject([{ id: 1, held: true, label: "person" }]);
      // When it was really seen last, not when it was held.
      expect(out[0].lastSeen).toBe(4 * GAP);
    }
    const back = t.update([det(0.4)], 7 * GAP);
    expect(back).toMatchObject([{ id: 1, lastSeen: 7 * GAP }]);
    expect(back[0].held).toBeUndefined();
  });
  it("is held for the stated number of results and then is gone", () => {
    const t = new Tracker(STEADY_TRACKER),
      shown: number[] = [];
    for (let i = 0; i < 5; i++) t.update([det(0.4)], i * GAP);
    for (let i = 5; i < 10; i++) shown.push(t.update([], i * GAP).length);
    expect(STEADY_TRACKER.holdMisses).toBe(3);
    expect(shown).toEqual([1, 1, 1, 0, 0]);
  });
  it("is placed where its velocity puts it, at its last size", () => {
    const t = new Tracker(STEADY_TRACKER),
      step = 0.01;
    for (let i = 0; i < 12; i++) t.update([det(0.2 + step * i)], i * GAP);
    const last = 0.2 + step * 11,
      held = t.update([], 12 * GAP)[0],
      next = t.update([], 13 * GAP)[0];
    // It goes on in the direction it was moving, about one step per result.
    expect(held.box.x).toBeGreaterThan(last + step * 0.5);
    expect(held.box.x).toBeLessThan(last + step * 1.5);
    expect(next.box.x).toBeGreaterThan(held.box.x);
    expect(held.box).toMatchObject({ w: 0.1, h: 0.2 });
    expect(held.box.y).toBeCloseTo(0.3, 9);
  });
  it("stays put when it was standing still", () => {
    const t = new Tracker(STEADY_TRACKER);
    for (let i = 0; i < 6; i++) t.update([det(0.4)], i * GAP);
    const held = t.update([], 6 * GAP)[0];
    expect(held.box.x).toBeCloseTo(0.4, 9);
    expect(held.box.y).toBeCloseTo(0.3, 9);
  });
  it("is not held once it was last seen longer ago than holdMs", () => {
    // Results half a second apart: one miss is already past the limit.
    const t = new Tracker(STEADY_TRACKER),
      gap = 500;
    expect(STEADY_TRACKER.holdMs).toBeLessThan(2 * gap);
    for (let i = 0; i < 4; i++) t.update([det(0.4)], i * gap);
    expect(t.update([], 4 * gap)).toHaveLength(1);
    expect(t.update([], 5 * gap)).toEqual([]);
    const slow = new Tracker(STEADY_TRACKER);
    for (let i = 0; i < 4; i++) slow.update([det(0.4)], i * 700);
    expect(slow.update([], 4 * 700)).toEqual([]);
  });
  it("does not hold an object that was never confirmed", () => {
    const t = new Tracker(STEADY_TRACKER);
    expect(t.update([det(0.4)], 0)).toEqual([]);
    expect(t.update([], GAP)).toEqual([]);
  });
  it("carries the score and finer name of its last sighting, not a new one", () => {
    const t = new Tracker(STEADY_TRACKER),
      seen = { ...det(0.4, 0.61), finer: { label: "armchair", score: 0.5 } };
    t.update([det(0.4)], 0);
    t.update([seen], GAP);
    expect(t.update([], 2 * GAP)[0]).toMatchObject({
      score: 0.61,
      finer: { label: "armchair", score: 0.5 },
      held: true,
    });
  });
  it("is off in the default tracker", () => {
    expect(DEFAULT_TRACKER.holdMisses).toBe(0);
    const t = new Tracker();
    t.update([det(0.4)], 0);
    expect(t.update([], GAP)).toEqual([]);
  });
});
