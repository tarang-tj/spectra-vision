/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, it, expect } from "vitest";
import { sampleBox } from "../src/measure/box-size";
import { retakesOf, type Retake } from "../src/modes/lib/depth-measured";
import { depthScale } from "../src/modes/lib/depth-metric";
import {
  WAITING,
  detailOf,
  exportMeasured,
} from "../src/modes/lib/object-measure-text";
import {
  measureTracks,
  type BoxReading,
} from "../src/modes/lib/object-measured";
import {
  bindSource,
  finishShape,
  place,
  resetRuler,
  setCustom,
  setRef,
  setTool,
} from "../src/panels/ruler/store";
import type { Box, Source, Track } from "../src/vision/types";
import { boardCorners, IMAGE, patchCorners } from "./fixtures/depth-scene";
import {
  outputFor,
  sceneMap,
  standingScene,
  UPRIGHT,
  type Standing,
} from "./fixtures/object-scene";
import { lcgNormal } from "./helpers/seeded";

// A box whose middle shows what is behind its object. On the synthetic scene
// (tests/fixtures/object-scene.ts) a table-like thing, two legs and a top
// with the floor showing between them, used to get a distance to that floor
// with a bar that left the thing itself outside. The foot of a box is the
// check: a standing thing's foot is never nearer than its middle.
const GENERATION = 7,
  source = {
    element: { naturalWidth: IMAGE.w, naturalHeight: IMAGE.h },
    kind: "image",
    label: "test",
    generation: GENERATION,
  } as unknown as Source,
  scene = standingScene(),
  // The board with everything under its top 200 mm and between two 60 mm
  // legs taken out.
  GAP: Standing = { x: -240, y: 3000, w: 480, h: 800 },
  track = (box: Box): Track => ({
    id: 3,
    label: "table",
    score: 0.76,
    box,
    lastSeen: 0,
    trail: [],
  });
type DepthMap = ReturnType<typeof sceneMap>;

function read(map: DepthMap, box: Box) {
  bindSource(GENERATION, IMAGE.w, IMAGE.h, 1);
  setRef("custom");
  setCustom("1000", "700");
  boardCorners().forEach((corner) => place(corner));
  setTool("area");
  for (const corner of patchCorners()) place(corner);
  finishShape();
  const scale = depthScale(map, GENERATION, source);
  if (!scale.metric) throw new Error(scale.reason);
  let retakes: Retake[] | null = null;
  for (let i = 0; i < 10; i++) retakes = retakesOf(scale);
  const measurement = measureTracks([track(box)], map, scale, retakes, 320);
  if (!measurement.metric) throw new Error(measurement.reason);
  return { measurement, reading: measurement.boxes[0] };
}
const FOOT =
  /^the foot of the box reads \d+% nearer than its middle, more than 0\.5 times the error bar \(\d+%\): the middle may show what is behind a hollow or thin object, or the box is loose$/;
const reasonOf = (reading: BoxReading) =>
  reading.state === "refused" ? reading.reason : reading.state;
const noisy = (open?: Standing, objectError = 0) =>
  sceneMap(320, 240, UPRIGHT, 0.02, lcgNormal(11), objectError, open);

describe("the foot of a box", () => {
  beforeEach(() => resetRuler());

  it("is the lowest eighth of the box's rows over the middle half of its columns", () => {
    const map = { width: 40, height: 40, values: new Float32Array(1600) };
    for (let row = 0; row < 40; row++)
      for (let col = 0; col < 40; col++)
        map.values[row * 40 + col] =
          row >= 35 ? (col >= 10 && col < 30 ? 7 : 9) : 3;
    const sample = sampleBox(map, { x: 0, y: 0, w: 1, h: 1 });
    expect(sample.median).toBe(3);
    expect(sample.foot).toBe(7);
  });

  it("refuses a hollow thing whose middle shows the floor behind it", () => {
    const { reading } = read(noisy(GAP), scene.box);
    expect(reasonOf(reading)).toMatch(FOOT);
    expect(detailOf(reading)[0]).toMatch(/^table: not measured \(the foot of/);
  });

  it("refuses a box that sits beside its object", () => {
    const beside = { ...scene.box, x: scene.box.x + scene.box.w };
    expect(reasonOf(read(noisy(), beside).reading)).toMatch(FOOT);
  });

  it("keeps a solid thing: a tight box, a box a fifth too large, and a thing the model reads 6% off", () => {
    const { box } = scene,
      loose = {
        x: box.x - 0.1 * box.w,
        y: box.y - 0.1 * box.h,
        w: 1.2 * box.w,
        h: 1.2 * box.h,
      },
      cases: [DepthMap, Box][] = [
        [noisy(), box],
        [noisy(), loose],
        [noisy(undefined, 0.06), box],
        [noisy(undefined, -0.06), box],
      ];
    for (const [map, at] of cases) {
      resetRuler();
      const { reading } = read(map, at);
      if (reading.state !== "measured") throw new Error(reasonOf(reading));
      expect(
        Math.abs(reading.distance.value * 1000 - scene.truth.distance),
      ).toBeLessThanOrEqual(reading.distance.error * 1000);
    }
  });

  it("says what the check is in the distance's basis and gives the foot in the export", () => {
    const { measurement, reading } = read(noisy(), scene.box);
    if (reading.state !== "measured") throw new Error(reasonOf(reading));
    expect(reading.distance.basis).toContain(
      "A box whose foot (its lowest eighth) reads nearer than its middle by more than 0.5 times this bar is not measured: its middle would be showing what is behind the object.",
    );
    // An upright thing seen from above: its foot is the farther end.
    expect(reading.footNearer).toBeLessThan(0);
    const exported = exportMeasured(measurement, {
      width: 320,
      height: 240,
      delegate: "CPU",
    });
    expect((exported.objects as { footNearer: number }[])[0].footNearer).toBe(
      reading.footNearer,
    );
    expect(String(exported.basis)).toContain("foot");
  });
});

describe("what the page says about the marked floor's reach and a moving picture", () => {
  beforeEach(() => resetRuler());

  /** The scene with the board's cells moved to `times` the depth of the
   * marked floor's far end (3,966 mm along the camera's axis). */
  const boardAt = (times: number) => {
    const map = sceneMap(320, 240),
      { box } = scene;
    for (let row = 0; row < 240; row++)
      for (let col = 0; col < 320; col++) {
        const x = (col + 0.5) / 320,
          y = (row + 0.5) / 240;
        if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h)
          map.values[row * 320 + col] = outputFor(times * 3966);
      }
    return map;
  };

  it("judges reach along the camera's axis and says so beside a straight-line distance", () => {
    const { reading } = read(boardAt(1.3), scene.box);
    if (reading.state !== "measured") throw new Error(reasonOf(reading));
    // The straight line is longer than the depth along the axis, so the
    // distance shown over the floor's far end is not the figure judged.
    expect(reading.distance.value / 3.966).toBeGreaterThan(1.33);
    expect(reading.distance.basis).toMatch(
      / Along the camera's axis the middle of the box is 1\.30 times as deep as the far end of the marked floor \(the floor runs from [\d.]+ ± [\d.]+ m to [\d.]+ ± [\d.]+ m deep\), so the fit is stretched; past 1\.5 times nothing is measured\.$/,
    );
  });

  it("names the axis when a box is past the reach", () => {
    expect(reasonOf(read(boardAt(1.6), scene.box).reading)).toBe(
      "along the camera's axis it is more than 1.5 times as deep as the far edge of the marked floor, where the fit is a guess",
    );
  });

  it("gives a paused video a reason that is true of a picture standing still", () => {
    expect(WAITING.moving).toBe(
      "Not measuring: this is a camera or a video. The Ruler's scale needs a photo, and a depth map takes up to a second to make, so on a moving picture it would describe an earlier frame than the boxes. Open a photo.",
    );
  });
});
