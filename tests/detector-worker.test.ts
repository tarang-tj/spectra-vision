/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import maps from "../src/panels/library/label-maps.json";
import {
  SHARPER_MIN_SCORE,
  SHARPER_SIZE,
} from "../src/vision/detector/sharper";
import { STAY_BELOW, faintOf } from "../src/vision/track-gate";
import type { Detection, TaskResult } from "../src/vision/types";
import { runWorker, workerSource } from "./helpers/worker-harness";

// Runs the real Sharper worker script against a stand-in for ONNX Runtime
// Web, as tests/depth-worker.test.ts does for the Depth worker: how it
// starts, what it feeds the model and how it reads the answer. The model
// itself runs in scripts/detector-check.mjs, on a real GPU.
const source = workerSource("detector-worker.js"),
  manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

type Message = Record<string, unknown>;
type Internals = {
  toTensorData(rgba: ArrayLike<number>, w: number, h: number): Float32Array;
  decode(
    logits: ArrayLike<number>,
    boxes: ArrayLike<number>,
    classes: number,
    floor: number,
    limit: number,
  ): Detection[];
  MODEL_LABELS: string[];
  LABELS: string[];
};
type Fed = { name: string; dims: number[]; data: Float32Array };
/** One query of the model's answer: a class, its score and a box given as
 * centre and size. */
type Query = { cls: number; score: number; box: number[] };
const logit = (p: number) => Math.log(p / (1 - p));
/** Logits and boxes for these queries, 80 classes each. */
function answer(queries: Query[]) {
  const logits = new Float32Array(queries.length * 80).fill(-9),
    boxes = new Float32Array(queries.length * 4);
  queries.forEach((q, i) => {
    logits[i * 80 + q.cls] = logit(q.score);
    boxes.set(q.box, i * 4);
  });
  return { logits, boxes, count: queries.length };
}

function startWorker(
  options: {
    gpu?: "none" | "no-adapter";
    queries?: Query[];
    /** Resolved by the test to let a run finish. */
    hold?: Promise<void>;
  } = {},
) {
  const posted: Message[] = [],
    imported: string[] = [],
    fetched: string[] = [],
    created: Message[] = [],
    fed: Fed[] = [],
    drawn: number[][] = [],
    env = { wasm: {} as Message, logLevel: "", webgpu: {} as Message };
  let lost: (info: Message) => void = () => {};
  env.webgpu.device = { lost: new Promise((done) => (lost = done)) };
  class Tensor {
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: number[],
    ) {}
  }
  const ort = {
    env,
    Tensor,
    InferenceSession: {
      create: async (_bytes: Uint8Array, sessionOptions: Message) => {
        created.push(sessionOptions);
        return {
          inputNames: ["pixel_values"],
          outputNames: ["logits", "pred_boxes"],
          run: async (feeds: Record<string, Tensor>) => {
            const [name, tensor] = Object.entries(feeds)[0];
            fed.push({ name, dims: tensor.dims, data: tensor.data });
            // The warm-up pass is never held.
            if (fed.length > 1) await options.hold;
            const out = answer(options.queries ?? []);
            return {
              logits: {
                dims: [1, out.count, 80],
                getData: async () => out.logits,
              },
              pred_boxes: {
                dims: [1, out.count, 4],
                getData: async () => out.boxes,
              },
            };
          },
        };
      },
    },
  };
  class Canvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return {
        drawImage: (_b: unknown, x: number, y: number, w: number, h: number) =>
          drawn.push([x, y, w, h]),
        // Red everywhere.
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) =>
            i % 4 === 0 || i % 4 === 3 ? 255 : 0,
          ),
        }),
      };
    }
  }
  const { self, send } = runWorker<{
    detectorInternals?: Internals;
    ort?: unknown;
    navigator: unknown;
    location: { href: string };
  }>(
    source,
    {
      importScripts: (url: string) => {
        imported.push(url);
        self.ort = ort;
      },
      OffscreenCanvas: Canvas,
      fetch: async (url: string) => {
        fetched.push(url);
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
      },
    },
    (message) => posted.push(message),
    {
      navigator:
        options.gpu === "none"
          ? {}
          : {
              gpu: {
                requestAdapter: async () =>
                  options.gpu === "no-adapter" ? null : {},
              },
            },
      location: { href: "https://site.test/app/detector-worker.js" },
    },
  );
  return {
    posted,
    imported,
    fetched,
    created,
    fed,
    drawn,
    send,
    lost: (info: Message) => lost(info),
    internals: self.detectorInternals!,
  };
}
const init = (options: Message = {}, delegate = "GPU") => ({
  type: "init",
  base: "https://site.test/app/",
  task: { kind: "object", model: "dfine_s_coco.onnx", options, delegate },
});
function bitmapOf() {
  const bitmap = { width: 1280, height: 720, closed: 0, close: () => {} };
  bitmap.close = () => void bitmap.closed++;
  return bitmap;
}
const frame = (bitmap: unknown, confidence = 0.45, time = 10) => ({
  type: "frame",
  bitmap,
  time,
  generation: 3,
  confidence,
});
const types = (posted: Message[]) => posted.map((m) => m.type);
const resultOf = (posted: Message[]) =>
  posted.find((m) => m.type === "result")!.result as TaskResult;

describe("the Sharper worker's labels", () => {
  const { MODEL_LABELS, LABELS } = startWorker().internals;
  it("names every class as the object filter, the Library and the export already do", () => {
    // Index for index the names of the EfficientDet models, which were read
    // out of the model files (tests/library-labels.test.ts).
    expect(LABELS).toEqual(maps.detector.labels);
  });
  it("keeps the model's own six odd spellings only as its input", () => {
    const renamed = MODEL_LABELS.flatMap((name, i) =>
      name === LABELS[i] ? [] : [[name, LABELS[i]]],
    );
    expect(renamed).toEqual([
      ["motorbike", "motorcycle"],
      ["aeroplane", "airplane"],
      ["sofa", "couch"],
      ["pottedplant", "potted plant"],
      ["diningtable", "dining table"],
      ["tvmonitor", "tv"],
    ]);
    expect(MODEL_LABELS).toHaveLength(80);
  });
});

describe("the Sharper worker's arithmetic", () => {
  const { toTensorData, decode } = startWorker().internals;
  it("feeds planar red, green, blue as value / 255, with no mean taken off", () => {
    // Two pixels: (255, 0, 51) and (0, 102, 255).
    const data = toTensorData([255, 0, 51, 255, 0, 102, 255, 255], 2, 1);
    expect([...data].map((v) => +v.toFixed(3))).toEqual([1, 0, 0, 0.4, 0.2, 1]);
  });
  it("turns a query into a named box with its sigmoid score, corner and size", () => {
    const { logits, boxes } = answer([
      { cls: 58, score: 0.9, box: [0.5, 0.4, 0.2, 0.6] },
    ]);
    const [d] = decode(logits, boxes, 80, 0.5, 20);
    expect(d.label).toBe("potted plant");
    expect(d.score).toBeCloseTo(0.9, 6);
    expect(d.box.x).toBeCloseTo(0.4, 6);
    expect(d.box.y).toBeCloseTo(0.1, 6);
    expect(d.box.w).toBeCloseTo(0.2, 6);
    expect(d.box.h).toBeCloseTo(0.6, 6);
  });
  it("keeps a box inside the picture", () => {
    const { logits, boxes } = answer([
      { cls: 0, score: 0.9, box: [0.05, 0.95, 0.3, 0.3] },
    ]);
    const { box } = decode(logits, boxes, 80, 0.5, 20)[0];
    expect(box.x).toBe(0);
    expect(box.w).toBeCloseTo(0.2, 6);
    expect(box.y + box.h).toBeCloseTo(1, 6);
  });
  it("drops what scores under the floor, sorts best first and stops at the limit", () => {
    const { logits, boxes } = answer([
      { cls: 56, score: 0.6, box: [0.5, 0.5, 0.1, 0.1] },
      { cls: 0, score: 0.49, box: [0.5, 0.5, 0.1, 0.1] },
      { cls: 41, score: 0.95, box: [0.5, 0.5, 0.1, 0.1] },
      { cls: 75, score: 0.5001, box: [0.5, 0.5, 0.1, 0.1] },
    ]);
    expect(decode(logits, boxes, 80, 0.5, 20).map((d) => d.label)).toEqual([
      "cup",
      "chair",
      "vase",
    ]);
    expect(decode(logits, boxes, 80, 0.5, 2).map((d) => d.label)).toEqual([
      "cup",
      "chair",
    ]);
  });
  it("leaves out a box that repeats a stronger one of its class", () => {
    const { logits, boxes } = answer([
      // One plant boxed twice: the second holds the first and is 0.62 of it.
      { cls: 58, score: 0.64, box: [0.975, 0.28, 0.05, 0.4] },
      { cls: 58, score: 0.56, box: [0.975, 0.395, 0.05, 0.65] },
      // Another plant beside it, and a vase inside the first box.
      { cls: 58, score: 0.55, box: [0.8, 0.3, 0.1, 0.4] },
      { cls: 75, score: 0.5, box: [0.975, 0.28, 0.05, 0.4] },
    ]);
    const kept = decode(logits, boxes, 80, 0.45, 20);
    expect(kept.map((d) => [d.label, Math.round(d.score * 100)])).toEqual([
      ["potted plant", 64],
      ["potted plant", 55],
      ["vase", 50],
    ]);
  });
  it("keeps two of a class that overlap less: one person in front of another", () => {
    const { logits, boxes } = answer([
      { cls: 0, score: 0.9, box: [0.45, 0.5, 0.9, 0.9] },
      { cls: 0, score: 0.7, box: [0.7, 0.5, 0.4, 0.9] },
    ]);
    expect(decode(logits, boxes, 80, 0.45, 20)).toHaveLength(2);
  });
  it("gives one box per query, under its best class", () => {
    const { logits, boxes } = answer([
      { cls: 56, score: 0.8, box: [0.5, 0.5, 0.1, 0.1] },
    ]);
    // The same query also scores "couch" above the floor.
    logits[57] = logit(0.7);
    expect(decode(logits, boxes, 80, 0.5, 20).map((d) => d.label)).toEqual([
      "chair",
    ]);
  });
});

describe("the Sharper worker's start", () => {
  it("refuses a browser with no WebGPU before fetching anything", async () => {
    const worker = startWorker({ gpu: "none" });
    await worker.send(init());
    expect(worker.posted).toEqual([
      {
        type: "error",
        error: "Vision model failed: this browser has no WebGPU",
      },
    ]);
    expect(worker.fetched).toEqual([]);
    expect(worker.imported).toEqual([]);
  });
  it("refuses a device that gives no adapter", async () => {
    const worker = startWorker({ gpu: "no-adapter" });
    await worker.send(init());
    expect(worker.posted[0].error).toBe(
      "Vision model failed: WebGPU gave no adapter on this device",
    );
    expect(worker.fetched).toEqual([]);
  });
  it("has no CPU path", async () => {
    const worker = startWorker();
    await worker.send(init({}, "CPU"));
    expect(worker.posted[0].error).toMatch(/graphics processor only/);
    expect(worker.fetched).toEqual([]);
  });
  it("loads the WebGPU build of the installed runtime from its versioned folder", async () => {
    const worker = startWorker(),
      folder = `https://site.test/app/runtime/ort-${manifest.devDependencies["onnxruntime-web"]}/`;
    await worker.send(init());
    expect(worker.imported).toEqual([`${folder}ort.webgpu.min.js`]);
    expect(worker.fetched.sort()).toEqual([
      "https://site.test/app/models/dfine_s_coco.onnx",
      `${folder}ort-wasm-simd-threaded.asyncify.wasm`,
    ]);
    expect(worker.created[0].executionProviders).toEqual(["webgpu"]);
  });
  it("spends the slow first pass on an empty picture before it says ready", async () => {
    const worker = startWorker();
    await worker.send(init());
    expect(types(worker.posted)).toEqual(["downloaded", "ready"]);
    expect(worker.fed).toHaveLength(1);
    expect(worker.fed[0].name).toBe("pixel_values");
    expect(worker.fed[0].dims).toEqual([1, 3, SHARPER_SIZE, SHARPER_SIZE]);
    expect(worker.fed[0].data.every((v) => v === 0)).toBe(true);
    expect(worker.posted[1].delegate).toBe("GPU");
  });
  it("takes another input size from the task, in multiples of 32 only", async () => {
    const worker = startWorker();
    await worker.send(init({ size: 480 }));
    expect(worker.fed[0].dims).toEqual([1, 3, 480, 480]);
    const odd = startWorker();
    await odd.send(init({ size: 500 }));
    expect(odd.fed[0].dims).toEqual([1, 3, 640, 640]);
  });
  it("says at once that the WebGPU device was lost", async () => {
    const worker = startWorker();
    await worker.send(init());
    worker.lost({ reason: "unknown", message: "the driver reset" });
    await new Promise((done) => setTimeout(done));
    expect(worker.posted.at(-1)).toEqual({
      type: "error",
      error:
        "Vision model failed: the WebGPU device was lost (the driver reset)",
    });
  });
});

describe("the Sharper worker's frames", () => {
  const scene: Query[] = [
    { cls: 0, score: 0.97, box: [0.5, 0.5, 0.2, 0.8] },
    { cls: 56, score: 0.62, box: [0.8, 0.6, 0.2, 0.3] },
    { cls: 60, score: 0.52, box: [0.8, 0.7, 0.3, 0.3] },
    { cls: 75, score: 0.47, box: [0.7, 0.4, 0.05, 0.1] },
    { cls: 73, score: 0.38, box: [0.75, 0.45, 0.05, 0.02] },
    { cls: 62, score: 0.42, box: [0.2, 0.2, 0.1, 0.1] },
    { cls: 41, score: 0.2, box: [0.9, 0.45, 0.03, 0.04] },
  ];
  it("squashes the whole picture to the square and feeds it scaled to 0..1", async () => {
    const worker = startWorker({ queries: scene }),
      bitmap = bitmapOf();
    await worker.send(init({ size: 64 }));
    await worker.send(frame(bitmap));
    expect(worker.drawn).toEqual([[0, 0, 64, 64]]);
    const fed = worker.fed[1];
    expect(fed.dims).toEqual([1, 3, 64, 64]);
    // Red plane 1, green and blue planes 0.
    expect(fed.data[0]).toBe(1);
    expect(fed.data[64 * 64]).toBe(0);
    expect(bitmap.closed).toBe(1);
  });
  it("shows nothing under its own floor, whatever the slider says below it", async () => {
    const worker = startWorker({ queries: scene });
    await worker.send(init());
    // Confidence 0.3: a MediaPipe result would hold everything from 0.3 up.
    await worker.send(frame(bitmapOf(), 0.3));
    const result = resultOf(worker.posted);
    expect(result.detections.map((d) => d.label)).toEqual([
      "person",
      "chair",
      "dining table",
      "vase",
    ]);
    expect(result.detections.every((d) => d.score >= SHARPER_MIN_SCORE)).toBe(
      true,
    );
    expect(result.kind).toBe("object");
    expect(result.generation).toBe(3);
  });
  it("returns the band under the gate apart, for the tracker alone", async () => {
    const worker = startWorker({ queries: scene });
    await worker.send(init());
    await worker.send(frame(bitmapOf(), 0.45));
    const result = resultOf(worker.posted),
      faint = faintOf(result);
    // The gate is the floor here, so the band runs STAY_BELOW under it.
    expect(faint.map((d) => d.label)).toEqual(["tv", "book"]);
    expect(Math.min(...faint.map((d) => d.score))).toBeGreaterThanOrEqual(
      SHARPER_MIN_SCORE - STAY_BELOW,
    );
    expect(scene.some((q) => q.score < SHARPER_MIN_SCORE - STAY_BELOW)).toBe(
      true,
    );
  });
  it("follows the slider above its floor, and leaves no key when the band is empty", async () => {
    const worker = startWorker({ queries: scene });
    await worker.send(init());
    await worker.send(frame(bitmapOf(), 0.9));
    const result = resultOf(worker.posted);
    expect(result.detections.map((d) => d.label)).toEqual(["person"]);
    expect(result.extra).toBeUndefined();
  });
  it("takes another floor from the task", async () => {
    const worker = startWorker({ queries: scene });
    await worker.send(init({ minScore: 0.15 }));
    await worker.send(frame(bitmapOf(), 0.15));
    expect(resultOf(worker.posted).detections).toHaveLength(7);
  });
  it("drops a frame that arrives while one is in the model", async () => {
    let release = () => {};
    const worker = startWorker({
        queries: scene,
        hold: new Promise((done) => (release = done)),
      }),
      first = bitmapOf(),
      second = bitmapOf();
    await worker.send(init());
    const running = worker.send(frame(first, 0.45, 10));
    await worker.send(frame(second, 0.45, 20));
    // The second was closed unread and nothing was queued for it.
    expect(second.closed).toBe(1);
    expect(worker.fed).toHaveLength(2);
    release();
    await running;
    expect(types(worker.posted).filter((t) => t === "result")).toHaveLength(1);
    // The next frame is taken again.
    await worker.send(frame(bitmapOf(), 0.45, 30));
    expect(types(worker.posted).filter((t) => t === "result")).toHaveLength(2);
  });
});
