/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  FaceExtra,
  GestureExtra,
  SegmentExtra,
  TaskKind,
  TaskResult,
} from "../src/vision/types";

// Runs the real worker script against stand-ins for the MediaPipe tasks, to
// check how each new kind is created and how its raw output is normalized.
// The models themselves are exercised in tests/e2e/modes.spec.ts.
const source = readFileSync(resolve("public/vision-worker.js"), "utf8");

type Posted = { message: Record<string, unknown>; transfer: unknown[] };
type Raw = Record<string, unknown>;
function startWorker(vision: Record<string, unknown>) {
  const posted: Posted[] = [];
  const self: {
    onmessage: ((event: { data: unknown }) => Promise<void>) | null;
    postMessage(message: Record<string, unknown>, transfer?: unknown[]): void;
  } = {
    onmessage: null,
    postMessage: (message, transfer = []) => posted.push({ message, transfer }),
  };
  class Canvas {
    getContext(kind: string) {
      return kind === "2d" ? { drawImage() {} } : null;
    }
  }
  // The worker downloads the model itself: hand it four bytes.
  const fetched = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  });
  new Function(
    "self",
    "importScripts",
    "Vision",
    "OffscreenCanvas",
    "fetch",
    source,
  )(
    self,
    () => {},
    { FilesetResolver: { forVisionTasks: async () => ({}) }, ...vision },
    Canvas,
    fetched,
  );
  const send = (data: unknown) => self.onmessage!({ data });
  return { posted, send };
}
// A stand-in task that records how it was created and returns `output`.
function fakeTask(output: Raw, created: Raw[], method: string) {
  return {
    createFromOptions: async (_files: unknown, options: Raw) => {
      created.push(options);
      return {
        setOptions: async () => {},
        getLabels: () => ["background", "hair", "clothes"],
        [method]: (_image: unknown, _time: number, callback?: unknown) => {
          if (typeof callback === "function") callback(output);
          return output;
        },
      };
    },
  };
}
async function run(kind: TaskKind, vision: Raw, options: Raw = {}) {
  const worker = startWorker(vision),
    bitmap = { width: 100, height: 50, close() {} };
  await worker.send({
    type: "init",
    base: "/",
    task: { kind, model: "m.task", options, delegate: "CPU" },
  });
  await worker.send({
    type: "frame",
    bitmap,
    time: 10,
    generation: 1,
    confidence: 0.45,
  });
  return worker.posted;
}
const resultOf = (posted: Posted[]) => {
  expect(posted.map((p) => p.message.type)).toEqual([
    "downloaded",
    "ready",
    "result",
  ]);
  return posted[2].message.result as TaskResult;
};
const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 0 });

describe("the worker's face kind", () => {
  it("returns face landmarks, named blendshape scores and matrices", async () => {
    const created: Raw[] = [],
      face = Array.from({ length: 478 }, (_, i) => point(i / 478, 0.5));
    const posted = await run(
      "face",
      {
        FaceLandmarker: fakeTask(
          {
            faceLandmarks: [face],
            faceBlendshapes: [
              {
                categories: [
                  { categoryName: "jawOpen", score: 0.5 },
                  { categoryName: "eyeBlinkLeft", score: 0.25 },
                ],
              },
            ],
            facialTransformationMatrixes: [
              { rows: 4, columns: 4, data: new Float32Array(16).fill(1) },
            ],
          },
          created,
          "detectForVideo",
        ),
      },
      { numFaces: 1 },
    );
    const result = resultOf(posted),
      extra = result.extra as FaceExtra;
    expect(created[0]).toMatchObject({
      runningMode: "VIDEO",
      numFaces: 1,
      baseOptions: { modelAssetBuffer: new Uint8Array(4), delegate: "CPU" },
    });
    expect(result.kind).toBe("face");
    expect(result.landmarks).toEqual([face]);
    expect(result.detections).toEqual([]);
    expect(extra.blendshapes).toEqual([{ jawOpen: 0.5, eyeBlinkLeft: 0.25 }]);
    expect(extra.matrices).toEqual([new Array(16).fill(1)]);
    expect(Array.isArray(extra.matrices[0])).toBe(true);
  });
  it("reports no face as empty lists, not as an error", async () => {
    const posted = await run("face", {
      FaceLandmarker: fakeTask({}, [], "detectForVideo"),
    });
    const result = resultOf(posted);
    expect(result.landmarks).toEqual([]);
    expect(result.extra).toEqual({ blendshapes: [], matrices: [] });
  });
});

describe("the worker's gesture kind", () => {
  it("returns hands, the top gesture of each, and one detection per hand", async () => {
    const left = [point(0.2, 0.3), point(0.4, 0.7)],
      right = [point(0.9, 0.1), point(1.2, 0.2)];
    const posted = await run("gesture", {
      GestureRecognizer: fakeTask(
        {
          landmarks: [left, right],
          handedness: [[{ categoryName: "Left" }], [{ categoryName: "Right" }]],
          gestures: [
            [
              { categoryName: "Thumb_Up", score: 0.9 },
              { categoryName: "None", score: 0.1 },
            ],
            [{ categoryName: "", score: 0 }],
          ],
        },
        [],
        "recognizeForVideo",
      ),
    });
    const result = resultOf(posted),
      extra = result.extra as GestureExtra;
    expect(result.landmarks).toEqual([left, right]);
    expect(result.handedness).toEqual(["Left", "Right"]);
    expect(extra.gestures).toEqual([
      { name: "Thumb_Up", score: 0.9, handedness: "Left" },
      { name: "None", score: 0, handedness: "Right" },
    ]);
    expect(result.detections.map((d) => [d.label, d.score])).toEqual([
      ["Thumb_Up", 0.9],
      ["None", 0],
    ]);
    const [a, b] = result.detections.map((d) => d.box);
    expect(a.x).toBeCloseTo(0.2);
    expect(a.y).toBeCloseTo(0.3);
    expect(a.w).toBeCloseTo(0.2);
    expect(a.h).toBeCloseTo(0.4);
    // A hand that runs past the edge is clamped to the image.
    expect(b.x + b.w).toBeCloseTo(1);
  });
});

describe("the worker's segment kind", () => {
  // A 4x2 mask: left half background, then hair above clothes.
  const mask = (values: number[]) => ({
    width: 4,
    height: 2,
    getAsFloat32Array: () => new Float32Array(values),
  });
  const masks = [
    mask([0.9, 0.8, 0.1, 0.2, 0.9, 0.7, 0.1, 0.0]),
    mask([0.1, 0.1, 0.8, 0.6, 0.0, 0.2, 0.3, 0.1]),
    mask([0.0, 0.1, 0.1, 0.2, 0.1, 0.1, 0.6, 0.9]),
  ];
  it("reduces confidence masks to a class mask, a matte and per-class shares", async () => {
    const created: Raw[] = [];
    const posted = await run(
      "segment",
      {
        ImageSegmenter: fakeTask(
          { confidenceMasks: masks },
          created,
          "segmentForVideo",
        ),
      },
      { outputConfidenceMasks: true },
    );
    const result = resultOf(posted),
      extra = result.extra as SegmentExtra;
    expect(created[0]).toMatchObject({ outputConfidenceMasks: true });
    expect([extra.width, extra.height, extra.background]).toEqual([4, 2, 0]);
    expect(Array.from(extra.mask)).toEqual([0, 0, 1, 1, 0, 0, 2, 2]);
    // The matte is one minus the background score (a 32-bit float) as a byte.
    expect(Array.from(extra.alpha)).toEqual(
      [0.9, 0.8, 0.1, 0.2, 0.9, 0.7, 0.1, 0.0].map((background) =>
        Math.round((1 - Math.fround(background)) * 255),
      ),
    );
    expect(extra.alpha[2]).toBeGreaterThan(220);
    expect(extra.alpha[0]).toBeLessThan(30);
    expect(extra.classes.map((c) => [c.label, c.pixels, c.share])).toEqual([
      ["background", 4, 0.5],
      ["hair", 2, 0.25],
      ["clothes", 2, 0.25],
    ]);
    expect(extra.classes[1].score).toBeCloseTo(0.7);
    expect(extra.classes[1].box).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(extra.classes[2].box).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    // Classes other than background are also detections, for the export.
    expect(result.detections.map((d) => [d.label, d.pixels, d.share])).toEqual([
      ["hair", 2, 0.25],
      ["clothes", 2, 0.25],
    ]);
    expect(result.landmarks).toEqual([]);
  });
  it("transfers the two masks instead of copying them", async () => {
    const posted = await run("segment", {
      ImageSegmenter: fakeTask(
        { confidenceMasks: masks },
        [],
        "segmentForVideo",
      ),
    });
    const extra = resultOf(posted).extra as SegmentExtra;
    expect(posted[2].transfer).toEqual([extra.mask.buffer, extra.alpha.buffer]);
    expect("transfer" in (posted[2].message.result as object)).toBe(false);
    // Other kinds transfer nothing.
    const face = await run("face", {
      FaceLandmarker: fakeTask({}, [], "detectForVideo"),
    });
    expect(face[1].transfer).toEqual([]);
  });
  it("hides classes the model was less sure about than the Confidence setting", async () => {
    const worker = startWorker({
      ImageSegmenter: fakeTask(
        { confidenceMasks: masks },
        [],
        "segmentForVideo",
      ),
    });
    await worker.send({
      type: "init",
      base: "/",
      task: { kind: "segment", model: "m", options: {}, delegate: "CPU" },
    });
    await worker.send({
      type: "frame",
      bitmap: { width: 1, height: 1, close() {} },
      time: 1,
      generation: 1,
      confidence: 0.72,
    });
    const result = worker.posted[2].message.result as TaskResult;
    expect(result.detections.map((d) => d.label)).toEqual(["clothes"]);
    expect((result.extra as SegmentExtra).classes).toHaveLength(3);
  });
  it("reports a segmenter that returns no masks as an error", async () => {
    const posted = await run("segment", {
      ImageSegmenter: fakeTask({}, [], "segmentForVideo"),
    });
    expect(posted[2].message.type).toBe("error");
    expect(String(posted[2].message.error)).toContain("no masks");
  });
});
