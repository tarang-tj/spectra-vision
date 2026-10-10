/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, it, expect } from "vitest";
import { formatMeasured } from "../src/measure/format";
import { isMeasured } from "../src/measure/noise";
import { floorSpan, measuredDepth } from "../src/modes/lib/depth-measured";
import { floorPolygons } from "../src/modes/lib/depth-floor";
import { depthScale, type MetricScale } from "../src/modes/lib/depth-metric";
import { depthRows, legendOf } from "../src/modes/lib/depth-readout";
import { derive } from "../src/panels/ruler/derive";
import {
  bindSource,
  finishShape,
  getState,
  place,
  resetRuler,
  setCustom,
  setRef,
  setTool,
} from "../src/panels/ruler/store";
import { depthAt } from "../src/vision/depth/affine-fit";
import { unprojectMetric } from "../src/vision/depth/unproject";
import type { Source, TaskResult } from "../src/vision/types";
import {
  boardCorners,
  floorDepthTruth,
  floorMap,
  heightTruth,
  IMAGE,
  patchCorners,
  SCALE,
  SHIFT,
} from "./fixtures/depth-scene";

// The Ruler on a synthetic photo of a floor (tests/fixtures/depth-scene.ts),
// and a depth map of that floor as a relative model would give it. The truth
// (every depth, the hidden scale and shift) comes from the fixture alone.
const GENERATION = 4,
  photo = { naturalWidth: IMAGE.w, naturalHeight: IMAGE.h },
  source = (element: object = photo): Source =>
    ({
      element,
      kind: "image",
      label: "test",
      generation: GENERATION,
    }) as unknown as Source,
  MAP = floorMap(160, 120);

function tapBoard() {
  bindSource(GENERATION, IMAGE.w, IMAGE.h, 1);
  setRef("custom");
  setCustom("1000", "700");
  for (const corner of boardCorners()) place(corner);
}
function outlinePatch() {
  setTool("area");
  for (const corner of patchCorners()) place(corner);
  finishShape();
}
/** The scale, asked for often enough that its retakes are worked out. */
function settled(scale: MetricScale) {
  for (let i = 0; i < 10; i++) measuredDepth(scale, MAP.max);
  return scale;
}

describe("metric scale from the Ruler's floor", () => {
  beforeEach(() => resetRuler());

  it("stays relative, and says what to do, until the Ruler has a reference", () => {
    const none = depthScale(MAP, GENERATION, source());
    expect(none.metric).toBe(false);
    if (!none.metric) expect(none.reason).toMatch(/open the Ruler on a photo/);
    // Three corners are not a reference either.
    bindSource(GENERATION, IMAGE.w, IMAGE.h, 1);
    boardCorners()
      .slice(0, 3)
      .forEach((corner) => place(corner));
    expect(depthScale(MAP, GENERATION, source()).metric).toBe(false);
  });

  it("refuses a reference alone when it spans too little depth, and says to outline floor", () => {
    // A Letter sheet 2 m away: its far edge is 1.1 times as far as its near.
    bindSource(GENERATION, IMAGE.w, IMAGE.h, 1);
    const sheet = [
      [-139.7, 2000],
      [139.7, 2000],
      [139.7, 2215.9],
      [-139.7, 2215.9],
    ];
    // The fixture's own projection, written out again for a second rectangle.
    const big = floorMap(480, 360);
    for (const [x, y] of sheet) {
      const cos = Math.cos((32 * Math.PI) / 180),
        sin = Math.sin((32 * Math.PI) / 180),
        z = cos * y + sin * 1500;
      place({
        x: IMAGE.w / 2 + (1300 * x) / z,
        y: IMAGE.h / 2 + (1300 * (-sin * y + cos * 1500)) / z,
      });
    }
    const scale = depthScale(big, GENERATION, source());
    expect(scale.metric).toBe(false);
    if (!scale.metric) {
      expect(scale.reason).toMatch(/nearly one depth/);
      expect(scale.reason).toMatch(/Area tool/);
    }
  });

  it("recovers the hidden scale and shift from the board and a floor outline", () => {
    tapBoard();
    outlinePatch();
    const s = getState();
    expect(floorPolygons(s, derive(s))).toHaveLength(2);
    const scale = depthScale(MAP, GENERATION, source());
    if (!scale.metric) throw new Error(scale.reason);
    // Exact taps on an exact picture: the Ruler's camera is the true one.
    expect(Math.abs(scale.fit.a / SCALE - 1)).toBeLessThan(0.005);
    expect(Math.abs(scale.fit.b / SHIFT - 1)).toBeLessThan(0.02);
    expect(scale.fit.residual).toBeLessThan(0.002);
    expect(scale.floorCells).toBeGreaterThan(1000);
    // The same map and the same Ruler state give the same object.
    expect(depthScale(MAP, GENERATION, source())).toBe(scale);
    // A depth read anywhere on the floor matches the truth to 0.5%.
    for (const [u, v] of [
      [800, 1100],
      [300, 700],
      [1300, 400],
    ]) {
      const truth = floorDepthTruth(u, v)!,
        output = (1 / truth - SHIFT) / SCALE;
      expect(Math.abs(depthAt(scale.fit, output)! / truth - 1)).toBeLessThan(
        0.005,
      );
    }
  });

  it("puts the whole map's points on the true floor, in millimetres", () => {
    tapBoard();
    outlinePatch();
    const scale = depthScale(MAP, GENERATION, source());
    if (!scale.metric) throw new Error(scale.reason);
    const cloud = unprojectMetric(
      MAP.values,
      MAP.width,
      MAP.height,
      {
        f: scale.camera.f,
        cx: scale.camera.cx,
        cy: scale.camera.cy,
        width: IMAGE.w,
        height: IMAGE.h,
      },
      (output) => depthAt(scale.fit, output),
      8000,
      scale.flatten,
    );
    expect(cloud.count).toBeGreaterThan(5000);
    let worst = 0;
    for (let i = 0; i < cloud.count; i++) {
      const z = cloud.positions[3 * i + 2],
        off = Math.abs(
          heightTruth({
            x: cloud.positions[3 * i],
            y: cloud.positions[3 * i + 1],
            z,
          }),
        );
      worst = Math.max(worst, off / z);
    }
    // Within 0.5% of each point's depth of the true floor plane.
    expect(worst).toBeLessThan(0.005);
  });

  it("states depths as measured values whose bars hold the truth", () => {
    tapBoard();
    outlinePatch();
    const scale = depthScale(MAP, GENERATION, source());
    if (!scale.metric) throw new Error(scale.reason);
    // Until the same scale has been asked for a few times, no bar yet.
    expect(measuredDepth(scale, MAP.max)).toBe("pending");
    expect(floorSpan(scale)).toBe("pending");
    settled(scale);
    for (const truth of [1400, 2500, 4000]) {
      const m = measuredDepth(scale, (1 / truth - SHIFT) / SCALE);
      if (!m || m === "pending") throw new Error("no measured depth");
      expect(isMeasured(m)).toBe(true);
      expect(m.unit).toBe("m");
      expect(m.error).toBeGreaterThan(0);
      expect(Math.abs(m.value * 1000 - truth)).toBeLessThanOrEqual(
        m.error * 1000,
      );
      expect(m.basis).toMatch(
        /2 standard deviations over \d+ simulated retakes/,
      );
      expect(m.basis).toMatch(/leaves out the depth model's own error/);
    }
    // The marked floor's own span, from the Ruler's geometry.
    const span = floorSpan(scale);
    if (!span || span === "pending") throw new Error("no span");
    expect(span.far.value).toBeGreaterThan(span.near.value * 1.3);
    expect(formatMeasured(span.near)).toMatch(/^\d+\.\d+ ± \d+\.\d+ m$/);
  });

  it("gives no reading where the fit cannot place a value", () => {
    tapBoard();
    outlinePatch();
    const scale = depthScale(MAP, GENERATION, source());
    if (!scale.metric) throw new Error(scale.reason);
    settled(scale);
    // An output under -shift / scale has no positive fitted inverse depth.
    expect(measuredDepth(scale, -SHIFT / SCALE - 0.5)).toBeNull();
    // One just above it is hundreds of metres away with a bar wider still.
    expect(measuredDepth(scale, -SHIFT / SCALE + 1e-4)).toBeNull();
    const task = {
        kind: "depth",
        delegate: "CPU",
        latency: 912.4,
        generation: GENERATION,
      } as TaskResult,
      far = { ...MAP, min: -SHIFT / SCALE - 0.5 },
      rows = depthRows(task, far, scale);
    expect(rows[1].detail).toMatch(/^not measured/);
    expect(rows[0].detail).toMatch(/^\d+\.\d+ ± \d+\.\d+ m$/);
    expect(rows.map((row) => row.label)).toEqual([
      "Nearest",
      "Farthest",
      "Model input",
      "Latency",
      "Running on",
      "Scale",
    ]);
    expect(rows[2].detail).toBe("160 x 120 px");
    expect(rows[3].detail).toBe("912 ms");
    expect(rows[4].detail).toBe("CPU (WebAssembly)");
    expect(legendOf(far, scale).far).toBe("past the fit");
  });

  it("shows relative values, never units, without a fit", () => {
    const scale = depthScale(MAP, GENERATION, source()),
      rows = depthRows(
        { kind: "depth", delegate: "GPU", latency: 80 } as TaskResult,
        MAP,
        scale,
      );
    expect(rows[0].detail).toBe(`${MAP.max.toFixed(2)} (relative)`);
    expect(rows[4].detail).toBe("GPU (WebGPU)");
    expect(rows[5].detail).toBe("relative");
    expect(legendOf(MAP, scale)).toEqual({
      near: "",
      far: "",
      note: "Relative depth. No lengths.",
    });
  });

  it("stays relative on a video, on another source and with an unresolved focal length", () => {
    tapBoard();
    outlinePatch();
    // A video element has no naturalWidth: its frozen frame is not the frame
    // the depth map was computed on.
    const video = depthScale(MAP, GENERATION, source({ videoWidth: IMAGE.w }));
    expect(video.metric).toBe(false);
    if (!video.metric) expect(video.reason).toMatch(/needs a photo/);
    // A map of another source generation.
    expect(depthScale(MAP, GENERATION + 1, source()).metric).toBe(false);
    expect(depthScale(MAP, GENERATION, null).metric).toBe(false);
  });

  it("follows the map: a map that contradicts the floor is refused", () => {
    tapBoard();
    outlinePatch();
    // Nearer floor reads farther: the map upside down.
    const flipped = {
      ...MAP,
      values: MAP.values.map((v) => MAP.max - v),
    };
    const scale = depthScale(flipped, GENERATION, source());
    expect(scale.metric).toBe(false);
    if (!scale.metric) expect(scale.reason).toMatch(/near end.*farther/);
  });
});
