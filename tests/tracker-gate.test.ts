/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { STAY_BELOW, faintOf, trackResult } from "../src/vision/track-gate";
import { STEADY_TRACKER, Tracker } from "../src/vision/tracker";
import type { Detection } from "../src/vision/types";

// The two-level gate as the app uses it: what reached the Confidence value
// goes to the tracker as detections, the band under it as `faint`. Holding is
// switched off here, so every box counted below was found by its own result.
const GATE = 0.45,
  options = { ...STEADY_TRACKER, holdMisses: 0 };
const det = (score: number, x = 0.4, label = "vase"): Detection => ({
  label,
  score,
  box: { x, y: 0.3, w: 0.1, h: 0.2 },
});
/** One result through the gate, split as the worker splits it. */
const feed = (t: Tracker, all: Detection[], time: number) =>
  t.update(
    all.filter((d) => d.score >= GATE),
    time,
    all.filter((d) => d.score < GATE && d.score >= GATE - STAY_BELOW),
  );

describe("the two-level gate", () => {
  it("keeps one box and one id for an object whose score wavers round the gate", () => {
    const t = new Tracker(options),
      shown: number[][] = [];
    for (let i = 0; i < 60; i++)
      shown.push(
        feed(t, [det(i % 2 ? 0.4 : 0.5)], i * 66).map((track) => track.id),
      );
    // Hidden on its first sighting (two are needed) and on the faint second
    // one (it cannot confirm), then shown on every result.
    expect(shown.slice(0, 2)).toEqual([[], []]);
    expect(shown.slice(2)).toEqual(Array(58).fill([1]));
  });
  it("with one gate the same object blinks on every other result", () => {
    // The comparison the fix is measured against: no band, as in 2.4.
    const t = new Tracker(options);
    let on = 0;
    for (let i = 0; i < 60; i++)
      on += t.update(i % 2 ? [] : [det(0.5)], i * 66).length;
    expect(on).toBe(29);
  });
  it("never shows an object that stays under the gate", () => {
    const t = new Tracker(options);
    for (let i = 0; i < 60; i++)
      expect(feed(t, [det(i % 2 ? 0.4 : 0.44)], i * 66)).toEqual([]);
    // It used up no id either: the first real object is number 1.
    feed(t, [det(0.8, 0.7, "chair")], 60 * 66);
    expect(feed(t, [det(0.8, 0.7, "chair")], 61 * 66)[0].id).toBe(1);
  });
  it("returns a faint sighting with its own score, never a remembered one", () => {
    const t = new Tracker(options);
    feed(t, [det(0.5)], 0);
    feed(t, [det(0.5)], 66);
    expect(feed(t, [det(0.33)], 132)).toMatchObject([{ id: 1, score: 0.33 }]);
  });
  it("lets go of an object that falls under the band", () => {
    const t = new Tracker(options);
    feed(t, [det(0.5)], 0);
    feed(t, [det(0.5)], 66);
    expect(feed(t, [det(GATE - STAY_BELOW - 0.01)], 132)).toEqual([]);
  });
  it("gives a faint detection to no track of another class or place", () => {
    const t = new Tracker(options);
    feed(t, [det(0.5)], 0);
    feed(t, [det(0.5)], 66);
    const next = feed(t, [det(0.4, 0.4, "cup"), det(0.4, 0.8)], 132);
    expect(next).toEqual([]);
  });
  it("prefers nothing: a strong and a faint box each go to their own track", () => {
    const t = new Tracker(options);
    feed(t, [det(0.6, 0.2), det(0.6, 0.7)], 0);
    feed(t, [det(0.6, 0.2), det(0.6, 0.7)], 66);
    const next = feed(t, [det(0.35, 0.2), det(0.6, 0.7)], 132);
    expect(next.map((x) => [x.id, x.score]).sort()).toEqual([
      [1, 0.35],
      [2, 0.6],
    ]);
  });
  it("never gives an id on a faint sighting: the box waits for one that reaches the gate", () => {
    const t = new Tracker(options);
    expect(feed(t, [det(0.5)], 0)).toEqual([]);
    // The second sighting is under the gate: two sightings, still no box.
    expect(feed(t, [det(0.4)], 66)).toEqual([]);
    const shown = feed(t, [det(0.5)], 132);
    expect(shown).toMatchObject([{ id: 1 }]);
    expect(shown[0].score).toBeGreaterThanOrEqual(GATE);
  });
  it("nor when results are slow, where one sighting is otherwise enough", () => {
    const t = new Tracker(options);
    expect(feed(t, [det(0.5)], 0)).toEqual([]);
    expect(feed(t, [det(0.4)], 500)).toEqual([]);
    // A sighting at the gate on a slow result still confirms at once.
    expect(feed(t, [det(0.5)], 1000)).toMatchObject([{ id: 1, score: 0.5 }]);
  });
});

describe("trackResult", () => {
  const result = (
    time: number,
    detections: Detection[],
    faint?: Detection[],
  ) => ({
    time,
    detections,
    tasks: faint ? { object: { extra: { faint } } } : {},
  });
  it("hands the band under the gate to the tracker with the result", () => {
    // The app's own tracker settings, holding included: with the band
    // unplugged the third result would come back held, with the old score.
    const t = new Tracker(STEADY_TRACKER);
    trackResult(t, result(0, [det(0.5)]) as never);
    expect(trackResult(t, result(66, [det(0.5)]) as never)).toMatchObject([
      { id: 1, score: 0.5 },
    ]);
    const next = trackResult(t, result(132, [], [det(0.4)]) as never);
    expect(next).toMatchObject([{ id: 1, score: 0.4 }]);
    expect(next[0].held).toBeUndefined();
  });
});

describe("faintOf", () => {
  it("reads the band from an object result and is empty everywhere else", () => {
    const faint = [det(0.4)];
    expect(faintOf({ extra: { faint } })).toBe(faint);
    expect(faintOf({ extra: { finer: {} } })).toEqual([]);
    expect(faintOf({ extra: { faint: "no" } })).toEqual([]);
    expect(faintOf({})).toEqual([]);
    expect(faintOf(undefined)).toEqual([]);
  });
});
