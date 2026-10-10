/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 * Original worker orchestration; ONNX Runtime Web (MIT) and the Depth Anything
 * V2 Small model (Apache-2.0) retain their own rights. */
// The Depth mode's worker: one monocular depth model on ONNX Runtime Web. It
// speaks the protocol of vision-worker.js (documented in docs/architecture.md):
//   in  { type: "init", base, task: TaskSpec }   out { type: "downloaded" } when the model and wasm
//                                                    bytes are in, then { type: "ready", delegate, files }
//   in  { type: "frame", bitmap, time, generation } out { type: "result", result: TaskResult }
//   any failure                                   out { type: "error", error }
// "GPU" is the WebGPU execution provider and "CPU" the WebAssembly one. A GPU
// start that fails is not retried here: the page restarts this worker on CPU.
//
// The model's output is affine-invariant inverse depth: larger means nearer,
// and neither its scale nor its zero is known. Nothing here turns it into a
// length; the page does that only when it has a measured floor to fit against.
let session = null,
  spec,
  runtime = null,
  inputName = "",
  outputName = "",
  canvas = null,
  ctx = null,
  files = [],
  lastTime = -1;

// From the model's preprocessor_config.json (DPTImageProcessor): RGB scaled to
// 0..1, then ImageNet mean and standard deviation; each side a multiple of the
// 14 pixel patch.
const PATCH = 14;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
// The side the picture is resized toward, per delegate, unless the task's
// options give another (`size: { CPU, GPU }`). 518 is the model's own size.
const DEFAULT_SIZE = { CPU: 252, GPU: 518 };
// The runtime's files are served from a folder named after its version
// (scripts/setup-assets.mjs copies them there), so a later upgrade can never
// pair a cached wasm file with a newer script.
const ORT_VERSION = "1.30.0";
// A very wide or very tall picture would otherwise become a very large input.
const MAX_SIDE_RATIO = 2;

/** The model input size for a picture, by the DPTImageProcessor rule with
 * `keep_aspect_ratio` and `ensure_multiple_of`: scale both sides by whichever
 * of target / width and target / height is closer to 1, then round each side
 * to a multiple of the patch. One difference: the longer side is capped at
 * MAX_SIDE_RATIO times the target. */
function inputSize(width, height, target) {
  const sw = target / width,
    sh = target / height,
    scale = Math.abs(1 - sw) < Math.abs(1 - sh) ? sw : sh,
    cap = MAX_SIDE_RATIO * target,
    snap = (value) =>
      Math.max(PATCH, Math.round(Math.min(value, cap) / PATCH) * PATCH);
  return { width: snap(width * scale), height: snap(height * scale) };
}

/** RGBA bytes (row by row) to the model's float tensor data: three planes,
 * red then green then blue, each (value / 255 - mean) / std. */
function toTensorData(rgba, width, height) {
  const count = width * height,
    out = new Float32Array(3 * count);
  for (let c = 0; c < 3; c++) {
    const scale = 1 / (255 * STD[c]),
      shift = MEAN[c] / STD[c],
      plane = c * count;
    for (let i = 0; i < count; i++)
      out[plane + i] = rgba[4 * i + c] * scale - shift;
  }
  return out;
}

/** Smallest and largest value, and whether every value is a finite number. */
function rangeOf(values) {
  let min = Infinity,
    max = -Infinity,
    finite = true;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!(v - v === 0)) finite = false;
    else {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max, finite: finite && values.length > 0 };
}

// Read by the unit tests (tests/depth-worker.test.ts); nothing else uses it.
self.depthInternals = { inputSize, toTensorData, rangeOf, DEFAULT_SIZE };

// The whole file, or an error that names it.
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  files.push(url);
  return new Uint8Array(await response.arrayBuffer());
}

const targetOf = () => {
  const asked = spec.options?.size?.[spec.delegate];
  return Number.isFinite(asked) && asked >= PATCH
    ? asked
    : DEFAULT_SIZE[spec.delegate];
};

async function start(base) {
  const gpu = spec.delegate === "GPU",
    folder = `${base}runtime/ort-${ORT_VERSION}/`,
    script = `${folder}${gpu ? "ort.webgpu.min.js" : "ort.wasm.min.js"}`,
    stem = gpu ? "ort-wasm-simd-threaded.asyncify" : "ort-wasm-simd-threaded";
  if (gpu) {
    // Checked before anything large is fetched for it.
    if (!self.navigator || !self.navigator.gpu)
      throw new Error("this browser has no WebGPU");
    if (!(await self.navigator.gpu.requestAdapter()))
      throw new Error("WebGPU gave no adapter on this device");
  }
  importScripts(script);
  runtime = self.ort;
  files.push(
    self.location && self.location.href,
    script,
    `${folder}${stem}.mjs`,
  );
  // Self-hosted: the runtime loads its loader script from this folder and is
  // handed the wasm bytes fetched here. One thread: without cross-origin
  // isolation (GitHub Pages cannot set it) the runtime has one anyway.
  runtime.env.logLevel = "error";
  runtime.env.wasm.wasmPaths = folder;
  runtime.env.wasm.numThreads = 1;
  const [model, wasm] = await Promise.all([
    download(`${base}models/${spec.model}`),
    download(`${folder}${stem}.wasm`),
  ]);
  runtime.env.wasm.wasmBinary = wasm;
  self.postMessage({ type: "downloaded" });
  session = await runtime.InferenceSession.create(model, {
    executionProviders: [gpu ? "webgpu" : "wasm"],
    graphOptimizationLevel: "all",
  });
  inputName = session.inputNames[0];
  outputName = session.outputNames[0];
  // A lost WebGPU device makes every later run fail or hang: say so at once,
  // so the page restarts this task on CPU.
  const device = gpu ? runtime.env.webgpu?.device : null;
  device?.lost?.then((info) => {
    if (info?.reason === "destroyed") return;
    self.postMessage({
      type: "error",
      error: `Vision model failed: the WebGPU device was lost (${info?.message || "no reason given"})`,
    });
  });
  canvas = new OffscreenCanvas(PATCH, PATCH);
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  self.postMessage({
    type: "ready",
    delegate: spec.delegate,
    files: files.filter((file) => typeof file === "string"),
    // The model's own tensor names, for the manual check script.
    names: { input: inputName, output: outputName },
  });
}

async function run(data) {
  const { bitmap, generation } = data,
    time = Math.max(data.time, lastTime + 1),
    started = performance.now(),
    size = inputSize(bitmap.width, bitmap.height, targetOf());
  lastTime = time;
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  // The canvas resamples with its own high quality filter, not the bicubic one
  // the model's reference preprocessing names.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  const rgba = ctx.getImageData(0, 0, size.width, size.height).data,
    input = new runtime.Tensor(
      "float32",
      toTensorData(rgba, size.width, size.height),
      [1, 3, size.height, size.width],
    ),
    output = (await session.run({ [inputName]: input }))[outputName],
    // [1, height, width]: the last two are the map's size.
    height = output.dims[output.dims.length - 2],
    width = output.dims[output.dims.length - 1],
    values = new Float32Array(await output.getData()),
    range = rangeOf(values);
  if (!range.finite || values.length !== width * height)
    throw new Error("the depth model returned values that are not numbers");
  self.postMessage(
    {
      type: "result",
      result: {
        kind: spec.kind,
        delegate: spec.delegate,
        generation,
        time,
        latency: performance.now() - started,
        detections: [],
        landmarks: [],
        handedness: [],
        extra: { width, height, values, min: range.min, max: range.max },
      },
    },
    [values.buffer],
  );
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      spec = data.task;
      await start(data.base);
    } else if (data.type === "frame") {
      if (!session) return;
      await run(data);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      error: `Vision model failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    if (data.bitmap)
      try {
        data.bitmap.close();
      } catch {
        /* Already closed. */
      }
  }
};
