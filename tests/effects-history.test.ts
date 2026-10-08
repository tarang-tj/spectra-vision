/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  createFigureSet,
  captureFigures,
  copyFigures,
  HAND,
  POSE,
} from "../src/effects/lib/figures";
import {
  createTrail,
  delayedIndex,
  pushTrail,
  trimTrail,
} from "../src/effects/lib/history";
import {
  blendshapesOf,
  facesOf,
  handsOf,
  matteOf,
  posesOf,
  px,
  py,
  shape,
} from "../src/effects/lib/inputs";
import {
  clampIntensity,
  effectIntensity,
  onEffectIntensity,
  setEffectIntensity,
} from "../src/effects/lib/intensity";
import { effects } from "../src/effects";
import { createFrame } from "../src/vision/frame";
import type { Frame } from "../src/vision/frame";
import type { Point, TaskKind, TaskResult } from "../src/vision/types";

const task = (
  kind: TaskKind,
  landmarks: Point[][],
  extra?: Record<string, unknown>,
): TaskResult => ({
  kind,
  generation: 1,
  time: 0,
  latency: 1,
  delegate: "CPU",
  detections: [],
  landmarks,
  handedness: [],
  extra,
});
function frameWith(tasks: Partial<Record<TaskKind, TaskResult>>): Frame {
  const frame = createFrame();
  frame.result = {
    mode: "test",
    generation: 1,
    time: 0,
    latency: 1,
    detections: [],
    landmarks: [],
    handedness: [],
    tasks,
  };
  frame.rect.x = 10;
  frame.rect.y = 20;
  frame.rect.w = 200;
  frame.rect.h = 100;
  return frame;
}
const points = (n: number, visibility?: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: i / n, y: 1 - i / n, visibility }));

describe("trails", () => {
  it("skips a still point, keeps moving ones, and drops the oldest when full", () => {
    const trail = createTrail(3);
    expect(pushTrail(trail, 0, 0, 0, 0.01)).toBe(true);
    expect(pushTrail(trail, 0.001, 0, 1, 0.01)).toBe(false);
    pushTrail(trail, 1, 0, 2, 0.01);
    pushTrail(trail, 2, 0, 3, 0.01);
    pushTrail(trail, 3, 0, 4, 0.01);
    expect(trail.count).toBe(3);
    expect(Array.from(trail.xy.slice(0, 6))).toEqual([1, 0, 2, 0, 3, 0]);
    expect(Array.from(trail.times.slice(0, 3))).toEqual([2, 3, 4]);
  });
  it("forgets old points but always keeps where the point is now", () => {
    const trail = createTrail(8);
    for (let i = 0; i < 5; i++) pushTrail(trail, i, i, i, 0.01);
    trimTrail(trail, 5, 2.5);
    expect(Array.from(trail.times.slice(0, trail.count))).toEqual([3, 4]);
    trimTrail(trail, 100, 2.5);
    expect(trail.count).toBe(1);
    expect([trail.xy[0], trail.xy[1]]).toEqual([4, 4]);
  });
});

describe("delayed ghosts", () => {
  it("picks the newest snapshot that is old enough, across the ring seam", () => {
    // Written in order 10, 11, 12, 13, 14 into a ring of 4: 14 overwrote 10.
    const times = [14, 11, 12, 13];
    expect(delayedIndex(times, 1, 4, 14)).toBe(0);
    expect(delayedIndex(times, 1, 4, 13.5)).toBe(3);
    expect(delayedIndex(times, 1, 4, 11)).toBe(1);
    expect(delayedIndex(times, 1, 4, 10.5)).toBe(-1);
    expect(delayedIndex(times, 1, 0, 99)).toBe(-1);
  });
});

describe("reading model output defensively", () => {
  it("returns empty lists and nulls when a model is not running", () => {
    const frame = createFrame();
    expect([handsOf(frame), posesOf(frame), facesOf(frame)]).toEqual([
      [],
      [],
      [],
    ]);
    expect(blendshapesOf(frame)).toBeNull();
    expect(matteOf(frame)).toBeNull();
    expect(shape(null, "jawOpen", 0.25)).toBe(0.25);
  });
  it("finds hands from the hand model or the gesture model", () => {
    const hand = [points(21)];
    expect(handsOf(frameWith({ hand: task("hand", hand) }))).toBe(hand);
    expect(handsOf(frameWith({ gesture: task("gesture", hand) }))).toBe(hand);
  });
  it("reads blendshapes and rejects malformed ones", () => {
    const good = frameWith({
      face: task("face", [points(478)], { blendshapes: [{ jawOpen: 0.6 }] }),
    });
    expect(shape(blendshapesOf(good), "jawOpen")).toBe(0.6);
    expect(shape(blendshapesOf(good), "missing")).toBe(0);
    expect(blendshapesOf(good, 3)).toBeNull();
    expect(
      blendshapesOf(
        frameWith({ face: task("face", [], { blendshapes: "no" }) }),
      ),
    ).toBeNull();
    expect(shape({ jawOpen: Number.NaN }, "jawOpen", 0.1)).toBe(0.1);
  });
  it("accepts a well-formed matte and rejects a short or mistyped one", () => {
    const alpha = new Uint8Array(16);
    const ok = matteOf(
      frameWith({
        segment: task("segment", [], { width: 4, height: 4, alpha }),
      }),
    );
    expect(ok && [ok.width, ok.height, ok.alpha === alpha]).toEqual([
      4,
      4,
      true,
    ]);
    expect(
      matteOf(
        frameWith({
          segment: task("segment", [], { width: 8, height: 4, alpha }),
        }),
      ),
    ).toBeNull();
    expect(
      matteOf(
        frameWith({
          segment: task("segment", [], { width: 4, height: 4, alpha: [1, 2] }),
        }),
      ),
    ).toBeNull();
    expect(matteOf(frameWith({ segment: task("segment", []) }))).toBeNull();
  });
  it("projects like frame.project, mirror included", () => {
    const frame = frameWith({});
    for (const mirror of [false, true]) {
      frame.mirror = mirror;
      const p = { x: 0.25, y: 0.5 },
        q = frame.project(p);
      expect([px(frame, p), py(frame, p)]).toEqual([q.x, q.y]);
    }
  });
});

describe("figure snapshots", () => {
  it("captures bodies then hands, and copies independently", () => {
    const frame = frameWith({
      pose: task("pose", [points(33, 0.9)]),
      hand: task("hand", [points(21, 0), points(5)]),
    });
    const set = createFigureSet(),
      copy = createFigureSet();
    captureFigures(frame, set);
    // The five-point hand is malformed and skipped.
    expect(set.count).toBe(2);
    expect([set.kinds[0], set.kinds[1]]).toEqual([POSE, HAND]);
    expect(set.data[2]).toBeCloseTo(0.9, 6);
    // Hand landmarks report a visibility of zero: stored as visible.
    expect(set.data[33 * 3 + 2]).toBe(1);
    copyFigures(set, copy);
    set.data[0] = 42;
    expect(copy.count).toBe(2);
    expect(copy.data[0]).toBe(0);
  });
});

describe("effect intensity", () => {
  it("falls back to the default, clamps, and notifies listeners", () => {
    let heard = 0;
    const off = onEffectIntensity(() => heard++);
    expect(effectIntensity("test-effect", 0.7)).toBe(0.7);
    setEffectIntensity("test-effect", 3);
    expect(effectIntensity("test-effect", 0.7)).toBe(1);
    setEffectIntensity("test-effect", 1);
    expect(heard).toBe(1);
    setEffectIntensity("test-effect", Number.NaN);
    expect(effectIntensity("test-effect", 0.7)).toBe(0);
    off();
    setEffectIntensity("test-effect", 0.5);
    expect(heard).toBe(2);
    expect(clampIntensity(-4)).toBe(0);
  });
  it("is declared by all eight GPU effects, which sort after the v1 effects", () => {
    const gl = effects.filter((e) => e.kind === "gl");
    expect(gl.map((e) => e.id).sort()).toEqual([
      "aura",
      "echo",
      "ember-trail",
      "face-light",
      "hologram",
      "neon-ribbons",
      "plasma-hands",
      "starfield-pull",
    ]);
    for (const effect of gl) {
      expect(effect.intensity?.default).toBeGreaterThan(0);
      expect(effect.order ?? 100).toBeGreaterThan(20);
      expect(effect.defaultOn).toBeFalsy();
    }
  });
});
