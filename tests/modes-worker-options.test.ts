/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaskResult } from "../src/vision/types";

// The real worker script against stand-ins for MediaPipe: the options message,
// several people in one fixed order, and finer names (classifier on crops).
const source = readFileSync(resolve("public/vision-worker.js"), "utf8");
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose stand-in output
type Posted = Record<string, unknown>;

function startWorker(vision: Raw, clock: { now: number }) {
  const posted: Posted[] = [],
    self: {
      onmessage: ((e: { data: unknown }) => Promise<void>) | null;
    } & Raw = {
      onmessage: null,
      postMessage: (m: Posted) => posted.push(m),
    };
  class Canvas {
    getContext(kind: string) {
      return kind === "2d" ? { drawImage() {} } : null;
    }
  }
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
    "performance",
    source,
  )(
    self,
    () => {},
    { FilesetResolver: { forVisionTasks: async () => ({}) }, ...vision },
    Canvas,
    fetched,
    { now: () => clock.now },
  );
  return { posted, send: (data: unknown) => self.onmessage!({ data }) };
}
const bitmap = () => ({ width: 100, height: 50, close() {} });
const results = (posted: Posted[]) =>
  posted.filter((p) => p.type === "result").map((p) => p.result as TaskResult);

describe("the options message", () => {
  const tasks = () => {
    const calls: Raw[] = [],
      Pose = {
        createFromOptions: async () => ({
          setOptions: async (o: Raw) => void calls.push(o),
          detectForVideo: () => ({ landmarks: [] }),
        }),
      };
    return { calls, Pose };
  };
  const init = {
    type: "init",
    base: "/",
    task: {
      kind: "pose",
      model: "m",
      options: { numPoses: 1 },
      delegate: "CPU",
    },
  };
  it("applies options to a running task with setOptions", async () => {
    const { calls, Pose } = tasks(),
      w = startWorker({ PoseLandmarker: Pose }, { now: 0 });
    await w.send(init);
    await w.send({ type: "options", options: { numPoses: 3 } });
    expect(calls).toEqual([{ numPoses: 3 }]);
  });
  it("keeps options that arrive while the task is still loading and applies them once", async () => {
    const { calls, Pose } = tasks(),
      w = startWorker({ PoseLandmarker: Pose }, { now: 0 });
    const loading = w.send(init);
    await w.send({ type: "options", options: { numPoses: 2 } });
    await loading;
    expect(calls).toEqual([{ numPoses: 2 }]);
    expect(w.posted.map((p) => p.type)).toEqual(["downloaded", "ready"]);
  });
});

describe("several people", () => {
  const pose = (x: number, id: number) =>
    Array.from({ length: 33 }, (_, i) => ({
      x,
      y: i / 40,
      z: id,
      visibility: 1,
    }));
  async function seen(landmarks: unknown[], world: unknown[]) {
    const w = startWorker(
      {
        PoseLandmarker: {
          createFromOptions: async () => ({
            setOptions: async () => {},
            detectForVideo: () => ({ landmarks, worldLandmarks: world }),
          }),
        },
      },
      { now: 0 },
    );
    await w.send({
      type: "init",
      base: "/",
      task: {
        kind: "pose",
        model: "m",
        options: { numPoses: 2 },
        delegate: "CPU",
      },
    });
    await w.send({
      type: "frame",
      bitmap: bitmap(),
      time: 1,
      generation: 1,
      confidence: 0.4,
    });
    return results(w.posted)[0];
  }
  it("returns people left to right, with their world landmarks in the same order", async () => {
    const r = await seen(
      [pose(0.8, 1), pose(0.2, 2)],
      [[{ x: 1 }], [{ x: 2 }]],
    );
    expect(r.landmarks.map((p) => p[0].z)).toEqual([2, 1]);
    expect((r.extra as { world: { x: number }[][] }).world).toEqual([
      [{ x: 2 }],
      [{ x: 1 }],
    ]);
  });
  it("leaves one person, and an already ordered pair, as they were", async () => {
    const one = await seen([pose(0.5, 1)], [[{ x: 1 }]]);
    expect(one.landmarks).toHaveLength(1);
    const two = await seen(
      [pose(0.1, 1), pose(0.9, 2)],
      [[{ x: 1 }], [{ x: 2 }]],
    );
    expect(two.landmarks.map((p) => p[0].z)).toEqual([1, 2]);
  });
});

describe("finer names", () => {
  const FINER = { model: "c.tflite", floor: 0.3, perPass: 2, everyMs: 1000 };
  const box = (x: number) => ({
    originX: x,
    originY: 5,
    width: 20,
    height: 20,
  });
  // Three chairs, as the detector reports them, and a classifier that answers
  // "armchair" at 0.8 for the first crop it is asked about and 0.1 otherwise.
  function setup(finer: unknown, scores: number[] = []) {
    const asked: Raw[] = [],
      clock = { now: 0 },
      // What the stand-ins do next: where the chairs are, whether the next
      // crops throw, and which source this is.
      state = { xs: [10, 40, 70], throwNext: 0, generation: 1 },
      detectionsNow = () =>
        state.xs.map((x) => ({
          categories: [{ categoryName: "chair", score: 0.9 }],
          boundingBox: box(x),
        }));
    const w = startWorker(
      {
        ObjectDetector: {
          createFromOptions: async (_f: unknown, o: Raw) => {
            asked.push({ created: o });
            return {
              setOptions: async () => {},
              detectForVideo: () => ({ detections: detectionsNow() }),
            };
          },
        },
        ImageClassifier: {
          createFromOptions: async () => ({
            close: () => asked.push({ closed: true }),
            classify: (_i: unknown, o: Raw) => {
              asked.push({ crop: o.regionOfInterest });
              clock.now += 10;
              if (state.throwNext > 0) {
                state.throwNext--;
                throw new Error("bad crop");
              }
              const score = scores.shift() ?? 0.8;
              return {
                classifications: [
                  { categories: [{ categoryName: "armchair", score }] },
                ],
              };
            },
          }),
        },
      },
      clock,
    );
    const frame = async (t: number) => {
      clock.now = t;
      await w.send({
        type: "frame",
        bitmap: bitmap(),
        time: t,
        generation: state.generation,
        confidence: 0.4,
      });
      return results(w.posted).at(-1)!;
    };
    return {
      w,
      asked,
      clock,
      state,
      frame,
      init: () =>
        w.send({
          type: "init",
          base: "/",
          task: {
            kind: "object",
            model: "m",
            options: { finer },
            delegate: "CPU",
          },
        }),
    };
  }
  const crops = (asked: Raw[]) => asked.filter((a) => a.crop);
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("is off by default: no classifier is created and results carry no finer data", async () => {
    const { w, asked, init, frame } = setup(null);
    await init();
    const r = await frame(0);
    expect(crops(asked)).toHaveLength(0);
    expect(r.extra).toBeUndefined();
    expect(r.detections.every((d) => d.finer === undefined)).toBe(true);
    expect(JSON.stringify(asked[0].created)).not.toContain("finer");
    expect(w.posted.map((p) => p.type)).toEqual([
      "downloaded",
      "ready",
      "result",
    ]);
  });
  it("classifies at most perPass crops a frame, each as a region of the frame", async () => {
    const { asked, init, frame } = setup(FINER);
    await init();
    await settle();
    const r = await frame(0);
    expect(crops(asked)).toHaveLength(2);
    const crop = crops(asked)[0].crop;
    expect([crop.left, crop.top, crop.right, crop.bottom]).toEqual(
      [0.1, 0.1, 0.1 + 0.2, 0.5].map((v, i) => (i === 2 ? 0.1 + 0.2 : v)),
    );
    expect(r.detections.filter((d) => d.finer)).toHaveLength(2);
    expect(r.detections[0]).toMatchObject({
      label: "chair",
      score: 0.9,
      finer: { label: "armchair", score: 0.8 },
    });
    expect(
      (r.extra as { finer: { classified: number; state: string } }).finer,
    ).toMatchObject({ classified: 2, state: "ready", floor: 0.3 });
  });
  it("names the third object next, never the two it already named, and then waits", async () => {
    const { asked, init, frame } = setup(FINER);
    await init();
    await settle();
    await frame(0);
    const before = crops(asked).length;
    const second = await frame(100);
    expect(crops(asked).length - before).toBe(1);
    expect(second.detections.every((d) => d.finer)).toBe(true);
    await frame(200);
    await frame(900);
    expect(crops(asked).length).toBe(before + 1);
    // After a second the oldest answers are renewed, still two a frame.
    await frame(1100);
    expect(crops(asked).length).toBe(before + 1 + 2);
  });
  it("shows no name under the floor and says it asked", async () => {
    const { init, frame } = setup(FINER, [0.29, 0.3]);
    await init();
    await settle();
    const r = await frame(0);
    expect(r.detections[0].finer).toBeUndefined();
    expect(r.detections[1].finer).toMatchObject({ score: 0.3 });
  });
  it("loads on demand through the options message and unloads when switched off", async () => {
    const { asked, init, frame, w } = setup(null);
    await init();
    await frame(0);
    expect(crops(asked)).toHaveLength(0);
    await w.send({ type: "options", options: { finer: FINER } });
    await settle();
    expect((await frame(10)).detections.some((d) => d.finer)).toBe(true);
    await w.send({ type: "options", options: { finer: null } });
    // The classifier is released, not just ignored.
    expect(asked.filter((a) => a.closed)).toHaveLength(1);
    const off = await frame(2000);
    expect(off.detections.some((d) => d.finer)).toBe(false);
    expect(off.extra).toBeUndefined();
  });

  it("forgets names when the source changes, so none is lent to another picture", async () => {
    const { asked, init, frame, state } = setup(FINER);
    await init();
    await settle();
    await frame(0);
    await frame(100);
    const before = crops(asked).length;
    state.generation = 2;
    const next = await frame(200);
    // The same boxes on a new source are classified again, not reused.
    expect(crops(asked).length - before).toBe(2);
    expect(next.detections.filter((d) => d.finer)).toHaveLength(2);
  });
  it("renews remembered names even while new boxes keep arriving", async () => {
    const { asked, init, frame, state } = setup({ ...FINER, perPass: 3 }, []);
    await init();
    await settle();
    state.xs = [10];
    await frame(0);
    // After a second the old answer is due, but three new boxes arrive.
    state.xs = [10, 40, 70, 90];
    const before = crops(asked).length;
    await frame(1200);
    const crop = crops(asked)
      .slice(before)
      .map((c) => c.crop.left);
    expect(crop).toHaveLength(3);
    expect(crop).toContain(0.1);
  });
  it("skips a crop that errors or has no area and keeps Finer names on", async () => {
    const { init, frame, state } = setup(FINER);
    await init();
    await settle();
    state.throwNext = 1;
    state.xs = [10, 100];
    const first = await frame(0);
    // One crop threw, one box lies past the edge: neither names anything and
    // the feature is still ready.
    expect(first.detections.some((d) => d.finer)).toBe(false);
    expect((first.extra as { finer: { state: string } }).finer.state).toBe(
      "ready",
    );
    state.xs = [10, 40];
    const later = await frame(1500);
    expect(later.detections.filter((d) => d.finer).length).toBeGreaterThan(0);
  });
  it("reports latency that includes the classifier's time", async () => {
    const { init, frame } = setup(FINER);
    await init();
    await settle();
    const r = await frame(0),
      info = (r.extra as { finer: { ms: number } }).finer;
    expect(info.ms).toBe(20);
    expect(r.latency).toBe(20);
  });
});
