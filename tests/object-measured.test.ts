/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { retakesOf, type Retake } from "../src/modes/lib/depth-measured";
import { depthScale } from "../src/modes/lib/depth-metric";
import {
  measureTask,
  measureWanted,
  onMeasureChange,
  resetMeasure,
  setMeasure,
} from "../src/modes/lib/object-measure";
import { measureStatus } from "../src/modes/lib/object-measure-frame";
import {
  detailOf,
  exportMeasured,
  labelPiece,
  rowPiece,
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
import objects from "../src/modes/objects";
import { createFrame, updateFrame } from "../src/vision/frame";
import type {
  Box,
  Source,
  TaskResult,
  Track,
  VisionResult,
} from "../src/vision/types";
import { boardCorners, IMAGE, patchCorners } from "./fixtures/depth-scene";
import {
  outputFor,
  sceneMap,
  standingScene,
  UPRIGHT,
} from "./fixtures/object-scene";
import { lcgNormal } from "./helpers/seeded";

// Objects' boxes measured on the synthetic scene of an upright board on a
// floor (tests/fixtures/object-scene.ts), with the Ruler tapped on a board
// lying on that floor as tests/depth-metric.test.ts does. Every truth comes
// from the fixture.
const GENERATION = 7,
  SIDE = 320,
  source = {
    element: { naturalWidth: IMAGE.w, naturalHeight: IMAGE.h },
    kind: "image",
    label: "test",
    generation: GENERATION,
  } as unknown as Source,
  scene = standingScene(),
  track = (box: Box, more: Partial<Track> = {}): Track => ({
    id: 3,
    label: "board",
    score: 0.76,
    box,
    lastSeen: 0,
    trail: [],
    ...more,
  });

/** The Ruler's taps, each moved by `off` source pixels (a tap that missed). */
function tapRuler(off: { x: number; y: number }[] = []) {
  bindSource(GENERATION, IMAGE.w, IMAGE.h, 1);
  setRef("custom");
  setCustom("1000", "700");
  boardCorners().forEach((corner, i) =>
    place({
      x: corner.x + (off[i]?.x ?? 0),
      y: corner.y + (off[i]?.y ?? 0),
    }),
  );
  setTool("area");
  for (const corner of patchCorners()) place(corner);
  finishShape();
}
type DepthMap = ReturnType<typeof sceneMap>;
/** Measure with the retakes worked out, as the stage has them after a moment. */
function measure(map: DepthMap, tracks: Track[]) {
  const scale = depthScale(map, GENERATION, source);
  let retakes: Retake[] | null = null;
  if (scale.metric) for (let i = 0; i < 10; i++) retakes = retakesOf(scale);
  return measureTracks(tracks, map, scale, retakes, SIDE);
}
function one(map: DepthMap, t: Track): BoxReading {
  const m = measure(map, [t]);
  if (!m.metric) throw new Error(m.reason);
  return m.boxes[0];
}
const measuredOne = (map: DepthMap, t: Track) => {
  const reading = one(map, t);
  if (reading.state !== "measured")
    throw new Error(reading.state === "refused" ? reading.reason : "pending");
  return reading;
};
const sized = (
  size: BoxReading & { state: "measured" },
  key: "width" | "height",
) => {
  const value = size[key];
  if (!("value" in value)) throw new Error(value.refused);
  return value;
};

describe("a box measured against the Ruler's floor", () => {
  beforeEach(() => resetRuler());

  it("holds the true distance, width and height inside its bars when the taps, the map and the model are off", () => {
    // Each corner of the reference tapped 1.5 px off (the Ruler's own tap
    // uncertainty), 2% noise on the map, and the model reading the board 6%
    // too far while it reads the floor right: the fit cannot see that.
    tapRuler([
      { x: -1.5, y: 1.5 },
      { x: 1.5, y: 1.5 },
      { x: 1.5, y: -1.5 },
      { x: -1.5, y: -1.5 },
    ]);
    const map = sceneMap(320, 240, UPRIGHT, 0.02, lcgNormal(11), 0.06),
      reading = measuredOne(map, track(scene.box)),
      { truth } = scene,
      off = (m: { value: number; error: number }, real: number) =>
        Math.abs(m.value * 1000 - real) / (m.error * 1000);
    expect(reading.distance.unit).toBe("m");
    expect(off(reading.distance, truth.distance)).toBeLessThanOrEqual(1);
    expect(off(sized(reading, "width"), truth.width)).toBeLessThanOrEqual(1);
    expect(off(sized(reading, "height"), truth.height)).toBeLessThanOrEqual(1);
    // The miss is a real one: more than the fit's scatter and the box's own
    // spread could explain, so the bar needs its other terms to hold it.
    const { terms } = reading;
    expect(
      Math.abs(reading.distance.value * 1000 - truth.distance) / 1000,
    ).toBeGreaterThan(Math.hypot(terms.scatter, terms.spread));
  });

  it("states a bar no smaller than any one of its parts", () => {
    tapRuler();
    const reading = measuredOne(sceneMap(320, 240), track(scene.box)),
      { terms } = reading;
    expect(Object.keys(terms).sort()).toEqual([
      "allowance",
      "scatter",
      "spread",
      "taps",
    ]);
    for (const term of Object.values(terms)) {
      expect(term).toBeGreaterThanOrEqual(0);
      expect(reading.distance.error).toBeGreaterThanOrEqual(term);
    }
    expect(terms.allowance).toBeCloseTo(0.11 * reading.distance.value, 9);
    expect(terms.taps).toBeGreaterThan(0);
  });

  it("refuses a box too small for the depth map, with the cell counts", () => {
    tapRuler();
    const small = { x: 0.45, y: 0.3, w: 20 / 320, h: 20 / 240 },
      reading = one(sceneMap(320, 240), track(small));
    expect(reading).toMatchObject({
      state: "refused",
      reason:
        "the box is too small for the depth map: 20 x 20 cells, it needs 28 x 28",
    });
    expect(detailOf(reading)).toEqual([
      "board: not measured (the box is too small for the depth map: 20 x 20 cells, it needs 28 x 28).",
    ]);
  });

  it("refuses a box whose middle is half board and half far floor", () => {
    tapRuler();
    // The box starts at the board's left edge and is twice as wide, so its
    // middle half runs from the board's middle to the floor beside it.
    const { box } = scene,
      wide = { ...box, w: box.w * 2 },
      reading = one(sceneMap(320, 240), track(wide));
    expect(reading.state).toBe("refused");
    expect(reading.state === "refused" && reading.reason).toMatch(
      /more than one depth/,
    );
  });

  it("refuses a box that reads three times as far as the marked floor's far edge", () => {
    tapRuler();
    const map = sceneMap(320, 240),
      scale = depthScale(map, GENERATION, source);
    if (!scale.metric) throw new Error(scale.reason);
    // The board's cells, moved to three times the patch's far edge.
    const far = outputFor(3 * scale.fit.far),
      { box } = scene;
    for (let row = 0; row < 240; row++)
      for (let col = 0; col < 320; col++) {
        const x = (col + 0.5) / 320,
          y = (row + 0.5) / 240;
        if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h)
          map.values[row * 320 + col] = far;
      }
    const reading = one(map, track(box));
    expect(reading.state).toBe("refused");
    expect(reading.state === "refused" && reading.reason).toMatch(
      /more than 1\.5 times as far as the far edge of the marked floor/,
    );
  });

  it("keeps the distance and the height of a box cut by the picture's side, and refuses its width", () => {
    tapRuler();
    const cut = { x: -2200, y: 3000, w: 900, h: 1000 },
      { box } = standingScene(cut);
    expect(box.x).toBe(0);
    const reading = measuredOne(sceneMap(320, 240, cut), track(box));
    expect(reading.distance.value).toBeGreaterThan(2);
    expect(reading.width).toEqual({
      refused:
        "the box touches the side of the picture, so the object may continue outside it",
    });
    expect(sized(reading, "height").value).toBeGreaterThan(0.5);
    expect(rowPiece(reading)).toMatch(/m away · box [\d.]+ ± [\d.]+ m tall$/);
    expect(detailOf(reading)[1]).toBe(
      "Box width: width not measured (the box touches the side of the picture, so the object may continue outside it).",
    );
  });

  it("refuses a held track: the latest result did not find it", () => {
    tapRuler();
    const reading = one(sceneMap(320, 240), track(scene.box, { held: true }));
    expect(reading).toMatchObject({
      state: "refused",
      reason: "the latest result did not find this box",
    });
    expect(labelPiece(reading)).toBe("not measured");
    expect(rowPiece(reading)).toBe("not measured");
  });

  it("gives no number at all without a scale from the Ruler", () => {
    const m = measure(sceneMap(320, 240), [track(scene.box)]);
    expect(m.metric).toBe(false);
    expect(!m.metric && m.reason).toMatch(/open the Ruler on a photo/);
    expect("boxes" in m).toBe(false);
    expect(labelPiece(undefined)).toBe("");
    expect(rowPiece(undefined)).toBe("");
    expect(
      exportMeasured(m, { width: 320, height: 240, delegate: "CPU" }),
    ).toEqual({
      metric: false,
      reason: `No metres: ${!m.metric && m.reason}`,
    });
  });

  it("says it is working the error out until the retakes are in", () => {
    tapRuler();
    const map = sceneMap(320, 240),
      scale = depthScale(map, GENERATION, source),
      m = measureTracks([track(scene.box)], map, scale, null, SIDE);
    if (!m.metric) throw new Error(m.reason);
    expect(m.boxes[0].state).toBe("pending");
    expect(labelPiece(m.boxes[0])).toBe("measuring…");
    expect(rowPiece(m.boxes[0])).toBe("working out the error");
  });

  it("words every number as a box's, with its bar and what the bar rests on", () => {
    tapRuler();
    const map = sceneMap(320, 240),
      m = measure(map, [track(scene.box)]);
    if (!m.metric) throw new Error(m.reason);
    const reading = m.boxes[0];
    if (reading.state !== "measured") throw new Error(reading.state);
    expect(labelPiece(reading)).toMatch(/^\d[\d.]* ± \d[\d.]* m away$/);
    const row = rowPiece(reading);
    expect(row).toMatch(
      /^[\d.]+ ± [\d.]+ m away · box [\d.]+ ± [\d.]+ m wide, [\d.]+ ± [\d.]+ m tall$/,
    );
    const [distance, width, height] = detailOf(reading);
    expect(distance).toMatch(/^Distance: [\d.]+ ± [\d.]+ m\. Straight line/);
    expect(distance).toContain("allowance of 11%");
    expect(distance).toContain("not measured on this picture");
    expect(distance).toMatch(/over \d+ simulated retakes of the Ruler's taps/);
    expect(width).toMatch(/^Box width: [\d.]+ ± [\d.]+ m\./);
    expect(width).toContain("not the object's outline");
    expect(width).toContain("5.0 px of this picture");
    expect(height).toMatch(/^Box height: [\d.]+ ± [\d.]+ m\./);
    expect(height).toContain("3.8 px of this picture");
    for (const text of [labelPiece(reading), row, distance, width, height])
      expect(text).not.toMatch(
        /accurate to|precise|exact|real size|true size/i,
      );

    const exported = exportMeasured(m, {
        width: 320,
        height: 240,
        delegate: "CPU",
      }),
      first = (exported.objects as Record<string, unknown>[])[0];
    expect(exported).toMatchObject({
      metric: true,
      offFloorAllowance: 0.11,
      map: { width: 320, height: 240, delegate: "CPU" },
    });
    expect(exported.fit).toMatchObject({ retakes: m.retakes });
    expect(first).toMatchObject({ id: 3, label: "board" });
    expect(Object.keys(first.distance as object).sort()).toEqual([
      "error",
      "unit",
      "value",
    ]);
    expect(first).toHaveProperty("boxWidth");
    expect(first).toHaveProperty("boxHeight");
    expect(first).not.toHaveProperty("width");
    expect(first).not.toHaveProperty("height");
    expect(String(exported.basis)).toContain("not the object's outline");
  });
});

describe("when the depth model is wanted for measuring", () => {
  const video = {
    ...source,
    element: { videoWidth: IMAGE.w, videoHeight: IMAGE.h },
  } as unknown as Source;
  beforeEach(() => {
    resetRuler();
    resetMeasure();
    setMeasure(true);
  });
  afterEach(() => {
    setMeasure(false);
    resetMeasure();
  });

  it("is off until it is switched on, and says so to whoever listens", () => {
    setMeasure(false);
    tapRuler();
    expect(measureWanted(source)).toEqual({ wanted: false, why: "off" });
    const heard = vi.fn(),
      off = onMeasureChange(heard);
    setMeasure(true);
    setMeasure(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(measureWanted(source)).toEqual({ wanted: true });
    off();
  });

  it("is never wanted on a camera or a video, whatever the Ruler holds", () => {
    tapRuler();
    expect(measureWanted(video)).toEqual({ wanted: false, why: "moving" });
    expect(measureTask.wanted(video)).toBe(false);
    expect(measureWanted(null)).toEqual({ wanted: false, why: "none" });
  });

  it("is not wanted before the Ruler has a solved reference on this photo", () => {
    expect(measureWanted(source)).toEqual({ wanted: false, why: "reference" });
    // Three corners are not a reference.
    bindSource(GENERATION, IMAGE.w, IMAGE.h, 1);
    boardCorners()
      .slice(0, 3)
      .forEach((corner) => place(corner));
    expect(measureWanted(source)).toEqual({ wanted: false, why: "reference" });
    resetRuler();
    tapRuler();
    expect(measureWanted(source)).toEqual({ wanted: true });
    expect(measureTask.wanted(source)).toBe(true);
    // The Ruler's points belong to one photo: another one has none.
    expect(measureWanted({ ...source, generation: GENERATION + 1 })).toEqual({
      wanted: false,
      why: "reference",
    });
  });

  it("tells the on-demand task to look again when the switch or the Ruler changes", () => {
    const look = vi.fn(),
      off = measureTask.subscribe(look);
    setMeasure(false);
    expect(look).toHaveBeenCalledTimes(1);
    tapRuler();
    expect(look.mock.calls.length).toBeGreaterThan(4);
    off();
    const before = look.mock.calls.length;
    setMeasure(true);
    resetRuler();
    expect(look).toHaveBeenCalledTimes(before);
  });

  it("says in one line what is missing before anything is fetched", () => {
    expect(measureStatus(video)).toMatchObject({
      state: "waiting",
      text: expect.stringMatching(
        /^Not measuring: this is a camera or a video\./,
      ),
    });
    expect(measureStatus(source)).toMatchObject({
      state: "waiting",
      text: expect.stringMatching(
        /the Ruler has no reference on this photo.*The depth model is not downloaded until then\.$/,
      ),
    });
    // Ready to measure, the model not started: it is loading, and says its size.
    tapRuler();
    expect(measureStatus(source)).toEqual({
      state: "loading",
      text: "Loading the depth model. The first time this is a 99 MB download.",
    });
    setMeasure(false);
    expect(measureStatus(source)).toEqual({ state: "off", text: "" });
  });

  it("runs the very task Depth runs", async () => {
    const depth = (await import("../src/modes/depth")).default;
    expect(measureTask.spec).toBe(depth.task);
  });
});

describe("what Objects shows of a measured box", () => {
  /** A canvas that only keeps the text drawn on it. */
  function canvas() {
    const texts: string[] = [],
      ctx = new Proxy(
        {},
        {
          get: (_, name) =>
            name === "fillText"
              ? (text: string) => void texts.push(text)
              : name === "measureText"
                ? (text: string) => ({ width: text.length * 6 })
                : () => {},
          set: () => true,
        },
      ) as unknown as CanvasRenderingContext2D;
    return { texts, ctx };
  }
  const map = sceneMap(320, 240),
    task = (kind: "object" | "depth", extra?: object) =>
      ({
        kind,
        generation: GENERATION,
        time: 40,
        latency: kind === "depth" ? 900 : 80,
        delegate: "CPU",
        model: kind === "object" ? "efficientdet_lite0.tflite" : "d.onnx",
        detections: [],
        landmarks: [],
        handedness: [],
        extra,
      }) as unknown as TaskResult,
    result = (withMap: boolean): VisionResult => ({
      mode: "objects",
      generation: GENERATION,
      time: 40,
      latency: 80,
      detections: [],
      landmarks: [],
      handedness: [],
      tasks: {
        object: task("object"),
        ...(withMap ? { depth: task("depth", map) } : {}),
      },
    }),
    data = (withMap: boolean) => ({
      result: result(withMap),
      tracks: [track(scene.box)],
      mirror: false,
      settings: { confidence: 0.5, selected: null, effects: {} },
      source,
      aspect: IMAGE.w / IMAGE.h,
    });
  /** Draw `count` frames of the same result and return the last one's labels. */
  function draw(shown: ReturnType<typeof data>, count: number) {
    const frame = createFrame();
    let last: string[] = [];
    for (let i = 0; i < count; i++) {
      const { texts, ctx } = canvas();
      updateFrame(
        frame,
        shown,
        IMAGE.w,
        IMAGE.h,
        800,
        600,
        1,
        i * 16,
        16,
        false,
        true,
      );
      objects.drawBase(ctx, frame);
      last = texts;
    }
    return last;
  }
  const PLAIN = "board  76% · 03";
  beforeEach(() => {
    resetRuler();
    resetMeasure();
    objects.leave?.();
  });
  afterEach(() => {
    setMeasure(false);
    resetMeasure();
    objects.leave?.();
  });

  it("is an on-demand task of Objects, not one of its own tasks", () => {
    expect(objects.onDemand).toEqual([measureTask]);
    expect(objects.task).toMatchObject({ kind: "object" });
  });

  it("adds the distance to the label, the sizes to the row and a key to the export", () => {
    setMeasure(true);
    tapRuler();
    const shown = data(true);
    // The first drawn frames have no bars yet, and say so.
    expect(draw(shown, 1)).toEqual(["board  76% · measuring… · 03"]);
    expect(objects.inspector(shown)[0].detail).toBe(
      "76% · working out the error",
    );
    const [label] = draw(shown, 10);
    expect(label).toMatch(/^board {2}76% · [\d.]+ ± [\d.]+ m away · 03$/);
    expect(objects.inspector(shown)[0].detail).toMatch(
      /^76% · [\d.]+ ± [\d.]+ m away · box [\d.]+ ± [\d.]+ m wide, [\d.]+ ± [\d.]+ m tall$/,
    );
    const exported = objects.exportFrame!(shown.result) as {
      measured: { metric: boolean; map: object; objects: { id: number }[] };
    };
    expect(Object.keys(exported)).toEqual(["measured"]);
    expect(exported.measured.metric).toBe(true);
    expect(exported.measured.map).toEqual({
      width: 320,
      height: 240,
      delegate: "CPU",
    });
    expect(exported.measured.objects[0].id).toBe(3);
    // A result of another photo gets nothing from this one's readings.
    expect(
      objects.exportFrame!({ ...shown.result, generation: GENERATION + 1 }),
    ).toEqual({});
  });

  it("shows exactly what it showed before while the switch is off, map or no map", () => {
    tapRuler();
    for (const withMap of [false, true]) {
      const shown = data(withMap);
      expect(draw(shown, 10)).toEqual([PLAIN]);
      expect(objects.inspector(shown)[0].detail).toBe("76%");
      expect(objects.exportFrame!(shown.result)).toEqual({});
    }
    // On, but no map of this photo yet: still nothing added.
    setMeasure(true);
    const waiting = data(false);
    expect(draw(waiting, 10)).toEqual([PLAIN]);
    expect(objects.inspector(waiting)[0].detail).toBe("76%");
    expect(objects.exportFrame!(waiting.result)).toEqual({});
  });

  it("adds nothing to a label or a row when the map cannot be put in metres", () => {
    setMeasure(true);
    const shown = data(true);
    expect(draw(shown, 10)).toEqual([PLAIN]);
    expect(objects.inspector(shown)[0].detail).toBe("76%");
    expect(objects.exportFrame!(shown.result)).toMatchObject({
      measured: {
        metric: false,
        reason: expect.stringMatching(/^No metres: /),
      },
    });
  });
});
