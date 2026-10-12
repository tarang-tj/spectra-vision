/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 * Original worker orchestration; ONNX Runtime Web (MIT) and the D-FINE-S
 * model (Apache-2.0) retain their own rights. */
// Objects' "Sharper" model: D-FINE-S, the checkpoint trained on COCO only, on
// the WebGPU provider of ONNX Runtime Web. It speaks the protocol of
// vision-worker.js for the object kind (documented in docs/architecture.md):
//   in  { type: "init", base, task: TaskSpec }   out { type: "progress", loaded, total } every few seconds
//                                                    of a long download, { type: "downloaded" } when the model
//                                                    and wasm bytes are in, then { type: "ready", delegate, files }
//   in  { type: "frame", bitmap, time, generation, confidence } out { type: "result", result: TaskResult }
//   any failure                                   out { type: "error", error }
// GPU only: on one WebAssembly thread a frame took about 1.1 s, so there is no
// CPU path here. A start that fails (no WebGPU, no adapter) or a lost device is
// posted as an error, and the page goes back to the MediaPipe detector
// (src/vision/task-runner.ts).
let session = null,
  spec,
  runtime = null,
  inputName = "",
  canvas = null,
  ctx = null,
  files = [],
  lastTime = -1,
  // True while a frame is in the model. A frame that arrives then is dropped,
  // so nothing queues behind a slow one.
  running = false;

// The folder of the runtime's files carries its version, as in depth-worker.js.
const ORT_VERSION = "1.30.0";
// The square the picture is resized to, unless the task's options give
// another (`size`, a multiple of 32). 640 is the size the model was trained at.
const DEFAULT_SIZE = 640;
// The lowest score this model's boxes are shown at, unless the task's options
// give another (`minScore`). Its scores sit higher than EfficientDet's: see
// SHARPER_MIN_SCORE in src/vision/detector/sharper.ts.
const DEFAULT_MIN_SCORE = 0.45;
// Two boxes of one class that overlap by more than this share of their
// joined area are one object named twice, and the weaker is dropped. The
// model needs no such step by design, but on the recorded scene it boxed one
// plant twice (64% and 56%, overlap 0.62).
const SAME_OBJECT = 0.55;
// The same figure as STAY_BELOW in src/vision/track-gate.ts: what scored up to
// this far under the gate is returned apart, as `extra.faint`.
const KEEP_BELOW = 0.15;

// The model's 80 class names in its own order, from `id2label` in the
// config.json beside the pinned file (onnx-community/dfine_s_coco-ONNX).
const MODEL_LABELS = (
  "person,bicycle,car,motorbike,aeroplane,bus,train,truck,boat,traffic light," +
  "fire hydrant,stop sign,parking meter,bench,bird,cat,dog,horse,sheep,cow," +
  "elephant,bear,zebra,giraffe,backpack,umbrella,handbag,tie,suitcase,frisbee," +
  "skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard," +
  "surfboard,tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana," +
  "apple,sandwich,orange,broccoli,carrot,hot dog,pizza,donut,cake,chair,sofa," +
  "pottedplant,bed,diningtable,toilet,tvmonitor,laptop,mouse,remote,keyboard," +
  "cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase," +
  "scissors,teddy bear,hair drier,toothbrush"
).split(",");
// Six of them are spelled another way by the EfficientDet models, whose names
// the object filter, the Library and the session export already use.
const RENAMED = {
  motorbike: "motorcycle",
  aeroplane: "airplane",
  sofa: "couch",
  pottedplant: "potted plant",
  diningtable: "dining table",
  tvmonitor: "tv",
};
const LABELS = MODEL_LABELS.map((name) => RENAMED[name] ?? name);

/** RGBA bytes (row by row) to the model's float tensor data: three planes,
 * red then green then blue, each value / 255. No mean or deviation
 * (`do_normalize: false` in the model's preprocessor_config.json). */
function toTensorData(rgba, width, height) {
  const count = width * height,
    out = new Float32Array(3 * count);
  for (let c = 0; c < 3; c++)
    for (let i = 0, plane = c * count; i < count; i++)
      out[plane + i] = rgba[4 * i + c] / 255;
  return out;
}

/** How much of the area two boxes cover together is covered by both. */
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
    both = w > 0 && h > 0 ? w * h : 0;
  return both / (a.w * a.h + b.w * b.h - both || 1);
}

/** The model's answer as detections, best first: one per query whose best
 * class scores `floor` or more, at most `limit` of them. `logits` holds
 * `classes` raw scores per query and `boxes` four numbers per query: centre
 * x, centre y, width, height as fractions of the input square, which is the
 * whole picture squashed, so they are fractions of the picture too.
 * The authors' own rule takes the top scores over every query and class at
 * once, which can name one box twice; here a query gives one box, and a
 * box that repeats a stronger one of its class is left out. */
function decode(logits, boxes, classes, floor, limit) {
  const out = [],
    // sigmoid(x) >= floor exactly when x >= this, so most of the scores are
    // compared and never exponentiated.
    cut = Math.log(floor / (1 - floor));
  for (let q = 0; q * classes < logits.length; q++) {
    let best = -Infinity,
      cls = 0;
    for (let k = 0; k < classes; k++) {
      const v = logits[q * classes + k];
      if (v > best) {
        best = v;
        cls = k;
      }
    }
    if (!(best >= cut)) continue;
    const [cx, cy, w, h] = [0, 1, 2, 3].map((k) => boxes[4 * q + k]),
      x0 = Math.max(0, cx - w / 2),
      y0 = Math.max(0, cy - h / 2);
    out.push({
      label: LABELS[cls] ?? "object",
      score: 1 / (1 + Math.exp(-best)),
      box: {
        x: x0,
        y: y0,
        w: Math.min(1, cx + w / 2) - x0,
        h: Math.min(1, cy + h / 2) - y0,
      },
    });
  }
  const kept = [];
  for (const d of out.sort((a, b) => b.score - a.score)) {
    if (kept.length === limit) break;
    if (
      !kept.some(
        (k) => k.label === d.label && overlap(k.box, d.box) > SAME_OBJECT,
      )
    )
      kept.push(d);
  }
  return kept;
}

/** The lowest score shown for this Confidence value: the slider's, but never
 * under the model's own floor. */
const gateOf = (confidence) => {
  const floor = Number(spec?.options?.minScore);
  return Math.max(
    Number.isFinite(confidence) ? confidence : 0,
    Number.isFinite(floor) ? floor : DEFAULT_MIN_SCORE,
  );
};

// Read by the unit tests (tests/detector-worker.test.ts); nothing else uses it.
self.detectorInternals = { toTensorData, decode, MODEL_LABELS, LABELS };

// How often a download in progress is reported to the page.
const PROGRESS_EVERY_MS = 5000;
// The whole file, or an error that names it. While a large file arrives the
// page is told every few seconds that the load is alive, as depth-worker.js
// does. `expected` is the file's size when the page knows it: the body is
// then read into one buffer of that size and the model is held once.
async function download(url, expected = 0) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  files.push(url);
  const reader = response.body?.getReader?.();
  if (!reader) return new Uint8Array(await response.arrayBuffer());
  const total = Number(response.headers?.get("content-length")) || 0,
    chunks = [];
  let whole = expected > 0 ? new Uint8Array(expected) : null,
    loaded = 0,
    told = performance.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (whole && loaded + value.length > whole.length) {
      chunks.push(whole.subarray(0, loaded));
      whole = null;
    }
    if (whole) whole.set(value, loaded);
    else chunks.push(value);
    loaded += value.length;
    if (performance.now() - told >= PROGRESS_EVERY_MS) {
      told = performance.now();
      self.postMessage({ type: "progress", loaded, total });
    }
  }
  if (whole) return loaded === whole.length ? whole : whole.slice(0, loaded);
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

const sizeOf = () => {
  const asked = Number(spec.options?.size);
  return asked >= 32 && asked % 32 === 0 ? asked : DEFAULT_SIZE;
};

/** One pass of the model over planar RGB of the input square. */
async function infer(data, size) {
  const output = await session.run({
    [inputName]: new runtime.Tensor("float32", data, [1, 3, size, size]),
  });
  if (!output.logits || !output.pred_boxes)
    throw new Error("the model gave no logits or boxes");
  return {
    logits: await output.logits.getData(),
    boxes: await output.pred_boxes.getData(),
    classes: output.logits.dims[output.logits.dims.length - 1],
  };
}

async function start(base) {
  if (spec.delegate !== "GPU")
    throw new Error("this model runs on a graphics processor only");
  // Checked before anything large is fetched.
  if (!self.navigator || !self.navigator.gpu)
    throw new Error("this browser has no WebGPU");
  if (!(await self.navigator.gpu.requestAdapter()))
    throw new Error("WebGPU gave no adapter on this device");
  const folder = `${base}runtime/ort-${ORT_VERSION}/`,
    script = `${folder}ort.webgpu.min.js`,
    stem = "ort-wasm-simd-threaded.asyncify";
  importScripts(script);
  runtime = self.ort;
  files.push(
    self.location && self.location.href,
    script,
    `${folder}${stem}.mjs`,
  );
  // Self-hosted and on one thread, for the reasons given in depth-worker.js.
  runtime.env.logLevel = "error";
  runtime.env.wasm.wasmPaths = folder;
  runtime.env.wasm.numThreads = 1;
  const [model, wasm] = await Promise.all([
    download(`${base}models/${spec.model}`, Number(spec.options?.bytes) || 0),
    download(`${folder}${stem}.wasm`),
  ]);
  runtime.env.wasm.wasmBinary = wasm;
  self.postMessage({ type: "downloaded" });
  session = await runtime.InferenceSession.create(model, {
    executionProviders: ["webgpu"],
    graphOptimizationLevel: "all",
    // Errors only, as in depth-worker.js.
    logSeverityLevel: 3,
  });
  inputName = session.inputNames[0];
  // A lost WebGPU device makes every later run fail or hang: say so at once.
  runtime.env.webgpu?.device?.lost?.then((info) => {
    if (info?.reason === "destroyed") return;
    self.postMessage({
      type: "error",
      error: `Vision model failed: the WebGPU device was lost (${info?.message || "no reason given"})`,
    });
  });
  const size = sizeOf();
  canvas = new OffscreenCanvas(size, size);
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  // The first pass compiles the shaders and took seconds where a later one
  // takes a tenth of one. It is spent here on an empty picture, so the first
  // real frame is answered at the usual pace.
  await infer(new Float32Array(3 * size * size), size);
  self.postMessage({
    type: "ready",
    delegate: spec.delegate,
    files: files.filter((file) => typeof file === "string"),
  });
}

async function run(data) {
  const { bitmap, generation } = data,
    time = Math.max(data.time, lastTime + 1),
    started = performance.now(),
    size = sizeOf(),
    gate = gateOf(data.confidence);
  lastTime = time;
  // The whole picture squashed to the square, as the model's own
  // preprocessing does (no bars are added).
  ctx.drawImage(bitmap, 0, 0, size, size);
  const rgba = ctx.getImageData(0, 0, size, size).data,
    { logits, boxes, classes } = await infer(
      toTensorData(rgba, size, size),
      size,
    ),
    all = decode(
      logits,
      boxes,
      classes,
      gate - KEEP_BELOW,
      Number(spec.options?.maxResults) || 20,
    ),
    faint = all.filter((d) => d.score < gate);
  self.postMessage({
    type: "result",
    result: {
      kind: spec.kind,
      delegate: spec.delegate,
      generation,
      time,
      latency: performance.now() - started,
      detections: all.filter((d) => d.score >= gate),
      landmarks: [],
      handedness: [],
      ...(faint.length ? { extra: { faint } } : {}),
    },
  });
}

self.onmessage = async ({ data }) => {
  // Only the frame that is in the model may clear the flag.
  const mine = data.type === "frame" && !!session && !running;
  try {
    if (data.type === "init") {
      spec = data.task;
      await start(data.base);
    } else if (mine) {
      running = true;
      await run(data);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      error: `Vision model failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    if (mine) running = false;
    if (data.bitmap)
      try {
        data.bitmap.close();
      } catch {
        /* Already closed. */
      }
  }
};
