/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, it, expect } from "vitest";
import { projectPose, type Pose } from "../src/measure/camera-fit";
import { mulMat, rodrigues } from "../src/measure/vec";
import { cameraOf, cameraTrials } from "../src/panels/ruler/camera-of";
import { derive } from "../src/panels/ruler/derive";
import { EXTENSIONS, extensionEnv } from "../src/panels/ruler/extensions";
import { allPlumbs, setPlumbs } from "../src/panels/ruler/plumbs";
import {
  bindSource,
  clear,
  getState,
  place,
  resetRuler,
  setTool,
  undo,
} from "../src/panels/ruler/store";

// A 1920 x 1440 picture taken 35 degrees down from 1.8 m away, f = 1500 px.
const W = 1920,
  H = 1440,
  POSE: Pose = {
    f: 1500,
    r: mulMat(
      rodrigues([(-55 * Math.PI) / 180, 0, 0]),
      [1, 0, 0, 0, -1, 0, 0, 0, -1],
    ),
    t: [0, 0, 1800],
  },
  FRAME = { cx: W / 2, cy: H / 2, fMin: 0, fMax: Infinity },
  shoot = (x: number, y: number, z = 0) => projectPose(POSE, FRAME, x, y, z)!;

/** Tap the four corners of a US Letter sheet lying at the origin. */
function tapSheet() {
  bindSource(1, W, H, 1);
  for (const [x, y] of [
    [-139.7, -107.95],
    [139.7, -107.95],
    [139.7, 107.95],
    [-139.7, 107.95],
  ])
    place(shoot(x, y));
}

describe("the Ruler's camera", () => {
  beforeEach(() => resetRuler());

  it("is null until the reference is solved, then recovers the true camera", () => {
    bindSource(1, W, H, 1);
    expect(cameraOf(getState(), derive(getState()))).toBeNull();
    tapSheet();
    const s = getState(),
      cam = cameraOf(s, derive(s))!;
    expect(cam.f).toBeCloseTo(1500, 1);
    expect(cam.centre[2]).toBeCloseTo(1800 * Math.sin((35 * Math.PI) / 180), 1);
    // The same state gives the same object: safe to call every frame.
    expect(cameraOf(s, derive(s))).toBe(cam);
    expect(extensionEnv().camera).toBe(cam);
  });

  it("re-solves when a plumb edge is added and forgets it on Clear", () => {
    tapSheet();
    const before = cameraOf(getState(), derive(getState()));
    setPlumbs("test", [{ a: shoot(900, 1500, 0), b: shoot(900, 1500, 2000) }]);
    const after = cameraOf(getState(), derive(getState()))!;
    expect(after).not.toBe(before);
    expect(after.f).toBeCloseTo(1500, 1);
    expect(allPlumbs()).toHaveLength(1);
    clear();
    expect(allPlumbs()).toHaveLength(0);
    expect(cameraOf(getState(), derive(getState()))).toBeNull();
  });

  it("gives seeded trials that scatter around the solved camera", () => {
    tapSheet();
    const s = getState(),
      d = derive(s),
      { trials, kept } = cameraTrials(s, d, 120);
    expect(kept).toBe(1);
    expect(trials).toHaveLength(120);
    expect(cameraTrials(s, d, 120).trials).toBe(trials);
    const heights = trials.map((t) => t.camera!.centre[2]),
      spread = Math.max(...heights) - Math.min(...heights);
    // Tap noise must move the answer, or the error bars built on it are zero.
    expect(spread).toBeGreaterThan(1);
    expect(new Set(trials.map((t) => t.seed)).size).toBe(120);
  });
});

describe("a tool from its own folder", () => {
  beforeEach(() => resetRuler());

  it("keeps the Ruler's own points when Undo is pressed with it chosen", () => {
    tapSheet();
    setTool("box");
    undo();
    expect(getState().corners).toHaveLength(4);
    setTool("span");
    undo();
    expect(getState().corners).toHaveLength(3);
  });

  it("is not offered while it is only a placeholder", () => {
    expect(EXTENSIONS.every((e) => !e.stub)).toBe(true);
  });
});
