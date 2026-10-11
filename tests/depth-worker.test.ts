/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DepthExtra, TaskResult } from "../src/vision/types";
import { runWorker, workerSource } from "./helpers/worker-harness";

// Runs the real Depth worker script against a stand-in for ONNX Runtime Web,
// as tests/modes-worker.test.ts does for the MediaPipe worker: how it loads,
// what it feeds the model and how it reads the answer. The model itself is
// exercised in tests/e2e/depth.spec.ts.
const source = workerSource("depth-worker.js"),
  manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

type Message = Record<string, unknown>;
type Posted = { message: Message; transfer: unknown[] };
type Internals = {
  inputSize(
    w: number,
    h: number,
    target: number,
  ): { width: number; height: number };
  toTensorData(rgba: ArrayLike<number>, w: number, h: number): Float32Array;
  rangeOf(values: ArrayLike<number>): {
    min: number;
    max: number;
    finite: boolean;
  };
  DEFAULT_SIZE: { CPU: number; GPU: number };
};
type Fed = { name: string; dims: number[]; data: Float32Array };

function startWorker(
  options: {
    gpu?: boolean;
    /** The output for an input of these dims; default is a ramp. */
    output?: (dims: number[]) => { dims: number[]; data: Float32Array };
    fail?: string;
  } = {},
) {
  const posted: Posted[] = [],
    imported: string[] = [],
    fetched: string[] = [],
    created: { bytes: number; options: Message }[] = [],
    fed: Fed[] = [],
    drawn: number[][] = [],
    env = { wasm: {} as Message, logLevel: "" };
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
      create: async (bytes: Uint8Array, sessionOptions: Message) => {
        created.push({ bytes: bytes.length, options: sessionOptions });
        return {
          inputNames: ["pixel_values"],
          outputNames: ["predicted_depth"],
          run: async (feeds: Record<string, Tensor>) => {
            const [name, tensor] = Object.entries(feeds)[0];
            fed.push({ name, dims: tensor.dims, data: tensor.data });
            if (options.fail) throw new Error(options.fail);
            const [, , h, w] = tensor.dims,
              out = options.output?.(tensor.dims) ?? {
                dims: [1, h, w],
                data: Float32Array.from({ length: h * w }, (_, i) => i / 10),
              };
            return {
              predicted_depth: {
                dims: out.dims,
                getData: async () => out.data,
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
        // Mid grey with a little red, everywhere.
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) =>
            i % 4 === 0 ? 255 : i % 4 === 3 ? 255 : 128,
          ),
        }),
      };
    }
  }
  const { self, send } = runWorker<{
    depthInternals?: Internals;
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
    (message, transfer) => posted.push({ message, transfer }),
    {
      navigator: options.gpu
        ? { gpu: { requestAdapter: async () => ({}) } }
        : {},
      location: { href: "https://site.test/app/depth-worker.js" },
    },
  );
  return {
    posted,
    imported,
    fetched,
    created,
    fed,
    drawn,
    env,
    send,
    internals: self.depthInternals!,
  };
}
const init = (delegate: "CPU" | "GPU", options: Message = {}) => ({
  type: "init",
  base: "https://site.test/app/",
  task: { kind: "depth", model: "depth.onnx", options, delegate },
});
function bitmapOf(width: number, height: number) {
  const bitmap = {
    width,
    height,
    closed: 0,
    close: () => void bitmap.closed++,
  };
  return bitmap;
}
const frame = (bitmap: unknown, time = 10, generation = 3) => ({
  type: "frame",
  bitmap,
  time,
  generation,
  confidence: 0.45,
});
const types = (posted: Posted[]) => posted.map((p) => p.message.type);

describe("the depth worker's preprocessing", () => {
  const { inputSize, toTensorData, rangeOf } = startWorker().internals;

  it("sizes the input by the model's own rule, to multiples of 14", () => {
    // DPTImageProcessor with keep_aspect_ratio: scale by whichever of
    // 518 / width and 518 / height is nearer 1, then round each side to 14.
    // 640 x 480: 518 / 480 = 1.079 is nearer 1 than 518 / 640 = 0.809, so
    // 640 * 1.079 = 690.7 -> 49.3 patches -> 49 * 14 = 686.
    expect(inputSize(640, 480, 518)).toEqual({ width: 686, height: 518 });
    // Portrait: the same with the sides swapped.
    expect(inputSize(480, 640, 518)).toEqual({ width: 518, height: 686 });
    // A small picture is scaled up by the smaller factor: 518 / 320 = 1.619,
    // so 240 * 1.619 = 388.5 -> 27.75 patches -> 28 * 14 = 392.
    expect(inputSize(320, 240, 518)).toEqual({ width: 518, height: 392 });
    // The demo still at the CPU size: 196 / 992 = 0.1976, so
    // 1586 * 0.1976 = 313.4 -> 22.4 patches -> 22 * 14 = 308.
    expect(inputSize(1586, 992, 196)).toEqual({ width: 308, height: 196 });
    expect(inputSize(518, 518, 518)).toEqual({ width: 518, height: 518 });
  });
  it("caps the long side of a very wide picture at twice the target", () => {
    // 4000 x 500 would become 4144 wide; the cap is 1036 = 74 * 14.
    expect(inputSize(4000, 500, 518)).toEqual({ width: 1036, height: 518 });
  });
  it("always gives sides that are positive multiples of 14", () => {
    for (const [w, h] of [
      [1, 1],
      [17, 3000],
      [1920, 1080],
      [1080, 1920],
      [333, 777],
    ])
      for (const target of [140, 196, 392, 518]) {
        const size = inputSize(w, h, target);
        expect(size.width % 14).toBe(0);
        expect(size.height % 14).toBe(0);
        expect(size.width).toBeGreaterThanOrEqual(14);
        expect(size.height).toBeGreaterThanOrEqual(14);
      }
  });

  it("normalizes with the model's mean and standard deviation, plane by plane", () => {
    // Two pixels: (255, 0, 128) and (0, 255, 51), alpha ignored.
    const data = toTensorData([255, 0, 128, 255, 0, 255, 51, 9], 2, 1);
    expect(data).toHaveLength(6);
    // Red plane: (1 - 0.485) / 0.229 and (0 - 0.485) / 0.229.
    expect(data[0]).toBeCloseTo(2.24891, 4);
    expect(data[1]).toBeCloseTo(-2.1179, 4);
    // Green plane: (0 - 0.456) / 0.224 and (1 - 0.456) / 0.224.
    expect(data[2]).toBeCloseTo(-2.03571, 4);
    expect(data[3]).toBeCloseTo(2.42857, 4);
    // Blue plane: (128 / 255 - 0.406) / 0.225 and (51 / 255 - 0.406) / 0.225.
    expect(data[4]).toBeCloseTo(0.42649, 4);
    expect(data[5]).toBeCloseTo(-0.91556, 4);
  });

  it("finds the range whatever the order, and flags values that are not numbers", () => {
    expect(rangeOf([5, 3, 1])).toEqual({ min: 1, max: 5, finite: true });
    expect(rangeOf([1, 3, 5])).toEqual({ min: 1, max: 5, finite: true });
    expect(rangeOf([2])).toEqual({ min: 2, max: 2, finite: true });
    expect(rangeOf([1, NaN, 2]).finite).toBe(false);
    expect(rangeOf([1, Infinity]).finite).toBe(false);
    expect(rangeOf([]).finite).toBe(false);
  });
});

/** Runs of equal bytes, as [value, length]: chunk k arrives filled with k + 1. */
function runs(bytes: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  for (const b of bytes) {
    const last = out[out.length - 1];
    if (last && last[0] === b) last[1]++;
    else out.push([b, 1]);
  }
  return out;
}

/** Starts the worker on a fetch whose model body arrives in chunks of these
 * sizes. `bytes` is the size the page states for the model (none when left
 * out); `slow` moves the clock on six seconds before the third chunk.
 * `events` lists, in order, each read of the model's body and each buffer of
 * 100 bytes or more that the worker itself makes. */
async function streamed(
  sizes: number[],
  options: { bytes?: number; slow?: boolean } = {},
) {
  const clock = { now: 0 },
    posted: Message[] = [],
    events: string[] = [],
    buffers: Uint8Array[] = [],
    seen: number[] = [];
  let model: Uint8Array | null = null;
  // The worker's own `new Uint8Array(n)`; the chunks below are made outside it.
  class Counted extends Uint8Array {
    constructor(a?: unknown, b?: unknown, c?: unknown) {
      super(a as ArrayBuffer, b as number, c as number);
      if (typeof a === "number" && a >= 100) {
        events.push(`buffer ${a}`);
        buffers.push(this);
      }
    }
  }
  const body = (parts: number[], watched: boolean) => {
    let i = 0;
    return {
      getReader: () => ({
        read: async () => {
          if (watched) events.push(`read ${i}`);
          if (options.slow && i === 2) clock.now += 6000;
          return i < parts.length
            ? { done: false, value: new Uint8Array(parts[i++]).fill(i) }
            : { done: true, value: undefined };
        },
      }),
    };
  };
  const { self, send } = runWorker<{
    ort?: unknown;
    navigator: unknown;
    location: { href: string };
  }>(
    source,
    {
      importScripts: () => {
        self.ort = {
          env: { wasm: {} },
          InferenceSession: {
            create: async (bytes: Uint8Array) => {
              model = bytes;
              seen.push(bytes.length, bytes[0], bytes[bytes.length - 1]);
              return { inputNames: ["in"], outputNames: ["out"] };
            },
          },
        };
      },
      OffscreenCanvas: class {
        getContext() {
          return {};
        }
      },
      fetch: async (url: string) => ({
        ok: true,
        headers: { get: () => "600" },
        body: /\.onnx$/.test(url) ? body(sizes, true) : body([8], false),
      }),
      performance: { now: () => clock.now },
      Uint8Array: Counted,
    },
    (message) => posted.push(message),
    { navigator: {}, location: { href: "https://site.test/depth-worker.js" } },
  );
  await send(init("CPU", options.bytes ? { bytes: options.bytes } : {}));
  return { posted, events, buffers, seen, model: model as Uint8Array | null };
}

describe("the depth worker's messages", () => {
  it("names the runtime folder after the installed runtime version", () => {
    const version = manifest.devDependencies["onnxruntime-web"];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(source).toContain(`const ORT_VERSION = "${version}";`);
  });

  it("loads the WebAssembly runtime and the model from the site for CPU", async () => {
    const worker = startWorker();
    await worker.send(init("CPU"));
    const folder = `https://site.test/app/runtime/ort-${manifest.devDependencies["onnxruntime-web"]}/`;
    expect(worker.imported).toEqual([`${folder}ort.wasm.min.js`]);
    expect(worker.fetched.sort()).toEqual([
      "https://site.test/app/models/depth.onnx",
      `${folder}ort-wasm-simd-threaded.wasm`,
    ]);
    expect(worker.env.wasm.wasmPaths).toBe(folder);
    expect(worker.env.wasm.numThreads).toBe(1);
    expect((worker.env.wasm.wasmBinary as Uint8Array).length).toBe(8);
    expect(worker.created).toHaveLength(1);
    expect(worker.created[0].options.executionProviders).toEqual(["wasm"]);
    expect(types(worker.posted)).toEqual(["downloaded", "ready"]);
    const ready = worker.posted[1].message;
    expect(ready.delegate).toBe("CPU");
    // Everything it fetched, its own script included, for the offline cache.
    expect((ready.files as string[]).sort()).toEqual(
      [
        "https://site.test/app/depth-worker.js",
        "https://site.test/app/models/depth.onnx",
        `${folder}ort-wasm-simd-threaded.mjs`,
        `${folder}ort-wasm-simd-threaded.wasm`,
        `${folder}ort.wasm.min.js`,
      ].sort(),
    );
  });

  it("loads the WebGPU build for GPU", async () => {
    const worker = startWorker({ gpu: true });
    await worker.send(init("GPU"));
    expect(worker.imported[0]).toMatch(/ort\.webgpu\.min\.js$/);
    expect(worker.fetched.join(" ")).toMatch(
      /ort-wasm-simd-threaded\.asyncify\.wasm/,
    );
    expect(worker.created[0].options.executionProviders).toEqual(["webgpu"]);
    expect(worker.posted[1].message).toMatchObject({
      type: "ready",
      delegate: "GPU",
    });
  });

  it("fails a GPU start where there is no WebGPU, before fetching anything", async () => {
    const worker = startWorker();
    await worker.send(init("GPU"));
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].message).toEqual({
      type: "error",
      error: "Vision model failed: this browser has no WebGPU",
    });
    expect(worker.imported).toEqual([]);
    expect(worker.fetched).toEqual([]);
  });

  it("feeds one frame at the delegate's size and returns the map", async () => {
    const worker = startWorker(),
      bitmap = bitmapOf(1586, 992);
    await worker.send(init("CPU"));
    await worker.send(frame(bitmap));
    expect(types(worker.posted)).toEqual(["downloaded", "ready", "result"]);
    // The CPU default is 196: the demo still becomes 308 x 196.
    expect(worker.drawn).toEqual([[0, 0, 308, 196]]);
    expect(worker.fed).toHaveLength(1);
    expect(worker.fed[0].name).toBe("pixel_values");
    expect(worker.fed[0].dims).toEqual([1, 3, 196, 308]);
    expect(worker.fed[0].data).toHaveLength(3 * 196 * 308);
    // The stand-in picture is red 255, green and blue 128 everywhere.
    expect(worker.fed[0].data[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    expect(worker.fed[0].data[196 * 308]).toBeCloseTo(
      (128 / 255 - 0.456) / 0.224,
      4,
    );
    const { message, transfer } = worker.posted[2],
      result = message.result as TaskResult,
      extra = result.extra as unknown as DepthExtra;
    expect(result).toMatchObject({
      kind: "depth",
      delegate: "CPU",
      generation: 3,
      time: 10,
      detections: [],
      landmarks: [],
      handedness: [],
    });
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(extra.width).toBe(308);
    expect(extra.height).toBe(196);
    expect(extra.values).toBeInstanceOf(Float32Array);
    expect(extra.values).toHaveLength(308 * 196);
    expect(extra.min).toBe(0);
    expect(extra.max).toBeCloseTo((308 * 196 - 1) / 10, 2);
    // The map is moved to the page, not copied, and the bitmap is closed.
    expect(transfer).toEqual([extra.values.buffer]);
    expect(bitmap.closed).toBe(1);
  });

  it("takes the input size from the task's options and keeps times increasing", async () => {
    const worker = startWorker();
    await worker.send(init("CPU", { size: { CPU: 140, GPU: 518 } }));
    await worker.send(frame(bitmapOf(1586, 992), 50));
    await worker.send(frame(bitmapOf(1586, 992), 20));
    expect(worker.fed.map((f) => f.dims)).toEqual([
      [1, 3, 140, 224],
      [1, 3, 140, 224],
    ]);
    const times = worker.posted
      .filter((p) => p.message.type === "result")
      .map((p) => (p.message.result as TaskResult).time);
    expect(times).toEqual([50, 51]);
  });

  it("reads a four-dimensional output by its last two sizes", async () => {
    const worker = startWorker({
      output: ([, , h, w]) => ({
        dims: [1, 1, h, w],
        data: new Float32Array(h * w).fill(2),
      }),
    });
    await worker.send(init("CPU"));
    await worker.send(frame(bitmapOf(640, 480)));
    const extra = (worker.posted[2].message.result as TaskResult)
      .extra as unknown as DepthExtra;
    expect([extra.width, extra.height]).toEqual([266, 196]);
    expect([extra.min, extra.max]).toEqual([2, 2]);
  });

  it("reports a model that throws, and one that returns values that are not numbers", async () => {
    const thrown = startWorker({ fail: "out of memory" }),
      first = bitmapOf(640, 480);
    await thrown.send(init("CPU"));
    await thrown.send(frame(first));
    expect(thrown.posted[2].message).toEqual({
      type: "error",
      error: "Vision model failed: out of memory",
    });
    expect(first.closed).toBe(1);

    const garbage = startWorker({
        output: ([, , h, w]) => ({
          dims: [1, h, w],
          data: new Float32Array(h * w).fill(NaN),
        }),
      }),
      second = bitmapOf(640, 480);
    await garbage.send(init("CPU"));
    await garbage.send(frame(second));
    expect(types(garbage.posted)).toEqual(["downloaded", "ready", "error"]);
    expect(garbage.posted[2].message.error).toMatch(/not numbers/);
    expect(second.closed).toBe(1);
  });

  it("reads a streamed download in full and reports progress while it is slow", async () => {
    // A fetch whose body arrives in three chunks, with the clock moved on six
    // seconds before the third: one progress report is due.
    const { posted, seen } = await streamed([100, 200, 300], { slow: true });
    expect(posted.map((m) => m.type)).toEqual([
      "progress",
      "downloaded",
      "ready",
    ]);
    expect(posted[0]).toEqual({ type: "progress", loaded: 600, total: 600 });
    // All 600 bytes, in order: the first chunk is filled with 1, the last 3.
    expect(seen).toEqual([600, 1, 3]);
  });

  it("reads a model of known size straight into one buffer of that size", async () => {
    const { events, buffers, model } = await streamed([100, 200, 300], {
      bytes: 600,
    });
    // The buffer exists before the first chunk is read, nothing else of the
    // model's size is made afterwards, and it is what the runtime is handed.
    expect(events).toEqual([
      "buffer 600",
      "read 0",
      "read 1",
      "read 2",
      "read 3",
    ]);
    expect(model).toBe(buffers[0]);
    expect(runs(model!)).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
  });

  it("joins the chunks afterwards when the size is not known", async () => {
    const { events, model } = await streamed([100, 200, 300]);
    expect(events).toEqual([
      "read 0",
      "read 1",
      "read 2",
      "read 3",
      "buffer 600",
    ]);
    expect(runs(model!)).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
  });

  it("loses no byte when the body is longer or shorter than the stated size", async () => {
    const longer = await streamed([100, 200, 300], { bytes: 250 });
    expect(runs(longer.model!)).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
    const shorter = await streamed([100, 200, 300], { bytes: 700 });
    expect(shorter.model!.length).toBe(600);
    expect(runs(shorter.model!)).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
    ]);
  });

  it("drops a frame that arrives before the model is loaded, closing its bitmap", async () => {
    const worker = startWorker(),
      bitmap = bitmapOf(640, 480);
    await worker.send(frame(bitmap));
    expect(worker.posted).toEqual([]);
    expect(bitmap.closed).toBe(1);
  });
});
