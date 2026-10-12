/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { STAY_BELOW, faintOf } from "../src/vision/track-gate";
import type { TaskKind, TaskResult } from "../src/vision/types";
import {
  runWorker,
  visionGlobals,
  workerSource,
} from "./helpers/worker-harness";

// The real worker script against a stand-in detector: what it returns under
// the Confidence value, and what it does to a task when the source changes.
const source = workerSource("vision-worker.js");
type Raw = Record<string, unknown>;
const scored = (score: number, x = 10) => ({
  categories: [{ categoryName: "vase", score }],
  boundingBox: { originX: x, originY: 5, width: 20, height: 20 },
});
function start(
  kind: TaskKind,
  name: string,
  method: string,
  output: Raw,
  more: { vision?: Raw; options?: Raw } = {},
) {
  const posted: Raw[] = [],
    options: Raw[] = [],
    { send } = runWorker(
      source,
      visionGlobals({
        [name]: {
          createFromOptions: async () => ({
            setOptions: async (o: Raw) => void options.push(o),
            [method]: () => output,
          }),
        },
        ...more.vision,
      }),
      (message) => posted.push(message),
    );
  const frame = (generation: number, time: number, confidence = 0.45) =>
    send({
      type: "frame",
      bitmap: { width: 100, height: 50, close() {} },
      time,
      generation,
      confidence,
    });
  const results = () =>
    posted
      .filter((p) => p.type === "result")
      .map((p) => p.result as TaskResult);
  const init = () =>
    send({
      type: "init",
      base: "/",
      task: { kind, model: "m", options: more.options ?? {}, delegate: "CPU" },
    });
  return { init, frame, results, options, posted };
}
const scores = (list: { score: number }[]) => list.map((d) => d.score);

describe("the worker's object kind: the band under the gate", () => {
  it("keeps what reached the Confidence value in detections and the band apart", async () => {
    const w = start("object", "ObjectDetector", "detectForVideo", {
      detections: [scored(0.5), scored(0.44), scored(0.31), scored(0.29)],
    });
    await w.init();
    await w.frame(1, 10);
    const [result] = w.results();
    // What the Library counts and the session export read is unchanged.
    expect(scores(result.detections)).toEqual([0.5]);
    expect(scores(faintOf(result))).toEqual([0.44, 0.31]);
    expect(faintOf(result)[0]).toMatchObject({
      label: "vase",
      box: { x: 0.1, y: 0.1, w: 0.2, h: 0.4 },
    });
  });
  it("ends the band at the figure the page documents", async () => {
    const edge = 0.6 - STAY_BELOW,
      w = start("object", "ObjectDetector", "detectForVideo", {
        detections: [scored(edge + 0.01), scored(edge - 0.01)],
      });
    await w.init();
    await w.frame(1, 10, 0.6);
    expect(scores(faintOf(w.results()[0]))).toEqual([edge + 0.01]);
  });
  it("follows the Confidence value of each frame", async () => {
    const w = start("object", "ObjectDetector", "detectForVideo", {
      detections: [scored(0.5), scored(0.3)],
    });
    await w.init();
    await w.frame(1, 10, 0.6);
    await w.frame(1, 20, 0.3);
    const [high, low] = w.results();
    expect(scores(high.detections)).toEqual([]);
    expect(scores(faintOf(high))).toEqual([0.5]);
    expect(scores(low.detections)).toEqual([0.5, 0.3]);
    expect(faintOf(low)).toEqual([]);
  });
  it("adds no key to a result with nothing in the band", async () => {
    const w = start("object", "ObjectDetector", "detectForVideo", {
      detections: [scored(0.9), scored(0.2)],
    });
    await w.init();
    await w.frame(1, 10);
    expect(w.results()[0].extra).toBeUndefined();
    expect(scores(w.results()[0].detections)).toEqual([0.9]);
  });
  it("names a box in the band like any other, so a finer name does not come and go", async () => {
    const w = start(
      "object",
      "ObjectDetector",
      "detectForVideo",
      { detections: [scored(0.9, 10), scored(0.4, 60)] },
      {
        options: {
          finer: { model: "c.tflite", floor: 0.3, perPass: 3, everyMs: 1000 },
        },
        vision: {
          ImageClassifier: {
            createFromOptions: async () => ({
              close() {},
              classify: () => ({
                classifications: [
                  { categories: [{ categoryName: "jug", score: 0.8 }] },
                ],
              }),
            }),
          },
        },
      },
    );
    await w.init();
    // The classifier loads in the background once the detector is ready.
    await new Promise((done) => setTimeout(done, 0));
    await w.frame(1, 10);
    const [result] = w.results();
    expect(result.detections[0].finer).toEqual({ label: "jug", score: 0.8 });
    expect(faintOf(result)[0].finer).toEqual({ label: "jug", score: 0.8 });
  });
  it("returns no band for a kind whose detections are not separate objects", async () => {
    // Gestures report one detection per hand whatever its score.
    const w = start("gesture", "GestureRecognizer", "recognizeForVideo", {
      landmarks: [[{ x: 0.2, y: 0.3 }]],
      handedness: [[{ categoryName: "Left" }]],
      gestures: [[{ categoryName: "Open_Palm", score: 0.35 }]],
    });
    await w.init();
    await w.frame(1, 10);
    expect(faintOf(w.results()[0])).toEqual([]);
    expect(scores(w.results()[0].detections)).toEqual([0.35]);
  });
});

describe("the worker on a new source", () => {
  const modes = (options: Raw[]) =>
    options.filter((o) => "runningMode" in o).map((o) => o.runningMode);
  it("leaves the object detector as it is, so its next result is not a slow one", async () => {
    const w = start("object", "ObjectDetector", "detectForVideo", {
      detections: [scored(0.9)],
    });
    await w.init();
    await w.frame(1, 10);
    await w.frame(2, 20);
    expect(modes(w.options)).toEqual([]);
    // Both sources still got their result, each under its own generation.
    expect(w.results().map((r) => r.generation)).toEqual([1, 2]);
  });
  it("still resets a task that tracks from frame to frame", async () => {
    const w = start("pose", "PoseLandmarker", "detectForVideo", {
      landmarks: [],
    });
    await w.init();
    await w.frame(1, 10);
    await w.frame(1, 20);
    await w.frame(2, 30);
    expect(modes(w.options)).toEqual(["IMAGE", "VIDEO", "IMAGE", "VIDEO"]);
  });
});
