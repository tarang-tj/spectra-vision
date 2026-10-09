/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 * Original worker orchestration; MediaPipe runtime and models retain Apache-2.0 rights. */
// One worker runs one vision task. Protocol (documented in docs/architecture.md):
//   in  { type: "init", base, task: TaskSpec }                  out { type: "downloaded" } when the model and
//                                                                   wasm bytes are in, then
//                                                               out { type: "ready", delegate, files }
//   in  { type: "options", options }                           applied to the running task with setOptions (no reload);
//                                                               kept until the task exists if it is still loading
//   Objects only: an option `finer` (null, or { model, floor, perPass, everyMs }) turns on
//   finer names: a second model, an image classifier, run on the crop of each
//   detected object. It is read from `init` and `options` and never reaches MediaPipe.
//   in  { type: "frame", bitmap, time, generation, confidence } out { type: "result", result: TaskResult }
//   any failure                                                 out { type: "error", error }
// A failed GPU start is not retried here: the page decides, and restarts this
// worker on CPU (src/vision/delegate.ts), which also discards any broken GL state.
let task,
  spec,
  handler,
  // Options that arrived before the task was created.
  pending = null,
  files = null,
  finer = null,
  workerBase = "",
  lastTime = -1,
  sourceGeneration = -1,
  threshold = 0.45;

// Detections become image-normalized boxes; landmarks are passed through.
const read = (output, bitmap, confidence) => ({
  detections: (output.detections ?? [])
    .map((d) => ({
      label: d.categories[0]?.categoryName ?? "object",
      score: d.categories[0]?.score ?? 0,
      box: {
        x: d.boundingBox.originX / bitmap.width,
        y: d.boundingBox.originY / bitmap.height,
        w: d.boundingBox.width / bitmap.width,
        h: d.boundingBox.height / bitmap.height,
      },
    }))
    .filter((d) => d.score >= confidence),
  landmarks: output.landmarks ?? [],
  handedness: (output.handedness ?? []).map(
    (h) => h[0]?.categoryName ?? "Hand",
  ),
});
const detect = (task, bitmap, time) => task.detectForVideo(bitmap, time);

// Pose and hand: the landmarks as above, plus MediaPipe's world landmarks
// (metres, same indexing as `landmarks`) in `extra.world`. A result without
// them gets an empty list; nothing is made up.
const readWorld = (output, bitmap, confidence) => ({
  ...read(output, bitmap, confidence),
  extra: { world: output.worldLandmarks ?? [] },
});

// Where a pose sits across the image: the mean x of the hips and shoulders it
// can see, else of all its points.
function centreX(points) {
  const used = [11, 12, 23, 24]
    .map((i) => points[i])
    .filter((p) => p && (p.visibility ?? 1) > 0.4);
  const list = used.length ? used : points;
  return list.reduce((sum, p) => sum + p.x, 0) / Math.max(1, list.length);
}
// Several people: MediaPipe returns them in an order that can change from
// frame to frame, which would swap their colours and rows. They are put in
// left to right order instead, landmarks and world landmarks together.
const readPose = (output, bitmap, confidence) => {
  const result = readWorld(output, bitmap, confidence);
  if (result.landmarks.length < 2) return result;
  const order = result.landmarks
    .map((points, i) => ({ i, x: centreX(points) }))
    .sort((a, b) => a.x - b.x || a.i - b.i)
    .map((entry) => entry.i);
  const world = result.extra.world;
  return {
    ...result,
    landmarks: order.map((i) => result.landmarks[i]),
    extra: {
      world: world.length === order.length ? order.map((i) => world[i]) : world,
    },
  };
};

// The image-normalized box around one set of landmarks, clamped to the image.
function boundsOf(points) {
  let x0 = 1,
    y0 = 1,
    x1 = 0,
    y1 = 0;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  return {
    x: x0,
    y: y0,
    w: Math.max(0, Math.min(1, x1) - x0),
    h: Math.max(0, Math.min(1, y1) - y0),
  };
}

// The whole file, or an error that names it.
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

// What was fetched from the site to get this worker ready: its own script,
// the runtime script, the wasm files MediaPipe chose and the model. The page hands the list to the
// service worker, so a file is kept for offline use only after it was used.
function fetchedFiles(base, model, wasm) {
  // The first five are certain: the task would not be ready without them.
  const files = new Set(
    [
      self.location && self.location.href,
      `${base}runtime/vision_bundle.js`,
      `${base}models/${model}`,
      wasm.wasmLoaderPath,
      wasm.wasmBinaryPath,
    ].filter((file) => typeof file === "string"),
  );
  try {
    for (const entry of performance.getEntriesByType("resource"))
      if (entry.name.startsWith(base)) files.add(entry.name);
  } catch {
    /* No resource timing here: the files above are still certain. */
  }
  return [...files];
}

// Face: 478 landmarks per face, plus every blendshape score by name and the
// 4x4 facial transformation matrix (column-major) in `extra`.
const readFace = (output) => ({
  detections: [],
  landmarks: output.faceLandmarks ?? [],
  handedness: [],
  extra: {
    blendshapes: (output.faceBlendshapes ?? []).map((face) =>
      Object.fromEntries(face.categories.map((c) => [c.categoryName, c.score])),
    ),
    matrices: (output.facialTransformationMatrixes ?? []).map((m) =>
      Array.from(m.data),
    ),
  },
});

// Gestures: hand landmarks as in "hand", plus the top gesture of every hand.
// Each hand is also a detection (gesture name, score, hand box) so that the
// session export, which keeps the flat fields only, records what was recognized.
const readGesture = (output) => {
  const hands = output.landmarks ?? [],
    handedness = (output.handedness ?? []).map(
      (h) => h[0]?.categoryName ?? "Hand",
    );
  const gestures = hands.map((_, i) => {
    const top = output.gestures?.[i]?.[0];
    return {
      name: top?.categoryName || "None",
      score: top?.score ?? 0,
      handedness: handedness[i] ?? "Hand",
    };
  });
  return {
    detections: gestures.map((g, i) => ({
      label: g.name,
      score: g.score,
      box: boundsOf(hands[i]),
    })),
    landmarks: hands,
    handedness,
    extra: { gestures },
  };
};

// Segment: the frame is drawn down to the model's own input size here, so the
// masks come back at MASK x MASK instead of the source resolution, and the two
// byte masks handed to the page are transferred, never copied.
const MASK = 256;
// The name of a software WebGL renderer (SwiftShader, llvmpipe), or "". The
// segmenter measured about 1.3 s a frame on SwiftShader against about 0.45 s on
// the CPU delegate, so a software GPU is refused and the page restarts on CPU.
function softwareRenderer() {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2"),
      info = gl?.getExtension("WEBGL_debug_renderer_info"),
      name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software/i.test(name) ? name : "";
  } catch {
    return "";
  }
}
function segmentHandler() {
  let labels = [],
    canvas,
    ctx;
  // Per pixel: the winning class and how sure the model is that it is not
  // background. Per class: pixel count, mean confidence and bounding box.
  const reduce = (masks) => {
    const width = masks[0].width,
      height = masks[0].height,
      count = width * height,
      scores = masks.map((m) => m.getAsFloat32Array()),
      background = Math.max(0, labels.indexOf("background"));
    const mask = new Uint8Array(count),
      alpha = new Uint8Array(count);
    const stats = scores.map(() => ({
      n: 0,
      sum: 0,
      x0: width,
      y0: height,
      x1: -1,
      y1: -1,
    }));
    for (let i = 0; i < count; i++) {
      let best = 0,
        top = scores[0][i];
      for (let c = 1; c < scores.length; c++)
        if (scores[c][i] > top) {
          top = scores[c][i];
          best = c;
        }
      mask[i] = best;
      alpha[i] = Math.round((1 - scores[background][i]) * 255);
      const s = stats[best],
        x = i % width,
        y = (i - x) / width;
      s.n++;
      s.sum += top;
      if (x < s.x0) s.x0 = x;
      if (x > s.x1) s.x1 = x;
      if (y < s.y0) s.y0 = y;
      if (y > s.y1) s.y1 = y;
    }
    const classes = stats.map((s, c) => ({
      label: labels[c] ?? `class ${c}`,
      pixels: s.n,
      share: s.n / count,
      score: s.n ? s.sum / s.n : 0,
      box: s.n
        ? {
            x: s.x0 / width,
            y: s.y0 / height,
            w: (s.x1 - s.x0 + 1) / width,
            h: (s.y1 - s.y0 + 1) / height,
          }
        : { x: 0, y: 0, w: 0, h: 0 },
    }));
    return { width, height, background, mask, alpha, classes };
  };
  return {
    create: async (files, options) => {
      const software =
        options.baseOptions.delegate === "GPU" ? softwareRenderer() : "";
      if (software)
        throw new Error(
          `the GPU here is software-rendered (${software}), which is slower than CPU for this model.`,
        );
      const segmenter = await Vision.ImageSegmenter.createFromOptions(
        files,
        options,
      );
      labels = segmenter.getLabels();
      canvas = new OffscreenCanvas(MASK, MASK);
      ctx = canvas.getContext("2d");
      return segmenter;
    },
    run: (task, bitmap, time) => {
      let reduced = null;
      ctx.drawImage(bitmap, 0, 0, MASK, MASK);
      // The masks are only valid inside the callback, which runs synchronously.
      task.segmentForVideo(canvas, time, (result) => {
        if (result.confidenceMasks?.length)
          reduced = reduce(result.confidenceMasks);
      });
      if (!reduced) throw new Error("the segmenter returned no masks.");
      return reduced;
    },
    confidence: null,
    // Every class that owns pixels, except background, is also a detection
    // (name, mean confidence, box, share) so it reaches the session export.
    read: (output, _bitmap, confidence) => ({
      detections: output.classes
        .filter(
          (c, i) =>
            i !== output.background && c.pixels > 0 && c.score >= confidence,
        )
        .map((c) => ({ ...c })),
      landmarks: [],
      handedness: [],
      extra: output,
      transfer: [output.mask.buffer, output.alpha.buffer],
    }),
  };
}

// Finer names. The classifier is created on demand and closed when switched
// off. A crop is classified only for a detection it has no fresh answer for:
// at most `perPass` crops per frame, each remembered object again after
// `everyMs`. A name under `floor` is never kept. The detector's own label and
// score are left as they are; the answer goes in `detection.finer`.
const IOU_SAME = 0.5;
function iouOf(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
    overlap = Math.max(0, w) * Math.max(0, h);
  return overlap / Math.max(1e-9, a.w * a.h + b.w * b.h - overlap);
}
// Decide, for each detection, whether to reuse a remembered answer or to
// classify its crop. Pure: returns { reuse: Map(index -> entry), todo: [index] }.
function planFiner(memory, detections, now, cfg) {
  const taken = new Set(),
    reuse = new Map(),
    stale = [],
    fresh = [];
  detections.forEach((d, i) => {
    let best = null,
      bestIou = IOU_SAME;
    memory.forEach((m, mi) => {
      if (taken.has(mi) || m.label !== d.label) return;
      const overlap = iouOf(m.box, d.box);
      if (overlap > bestIou) {
        bestIou = overlap;
        best = mi;
      }
    });
    if (best === null) return fresh.push(i);
    taken.add(best);
    const m = memory[best];
    reuse.set(i, m);
    if (now - m.at >= cfg.everyMs) stale.push(i);
  });
  // New objects first, then the answers that are oldest. One slot of every
  // pass goes to the oldest answer when there is one, so a busy scene that
  // keeps producing new boxes cannot starve the renewal of remembered names.
  stale.sort((a, b) => reuse.get(a).at - reuse.get(b).at);
  const room = stale.length && cfg.perPass > 1 ? cfg.perPass - 1 : cfg.perPass;
  return {
    reuse,
    todo: [...fresh.slice(0, room), ...stale].slice(0, cfg.perPass),
  };
}
// An object nobody has classified yet is due at once.
const NEVER = -1e15;
let memory = [];
// Release the classifier's graph and forget every name it gave.
function closeFiner() {
  try {
    finer?.classifier?.close();
  } catch {
    /* A classifier that is already gone needs nothing more. */
  }
  finer = null;
  memory = [];
}
async function setFiner(next, base) {
  if (!next) {
    closeFiner();
    return;
  }
  if (finer && finer.cfg.model === next.model) {
    finer.cfg = next;
    return;
  }
  closeFiner();
  finer = { cfg: next, state: "loading", note: "", classifier: null };
  const mine = finer;
  memory = [];
  try {
    const bytes = await download(`${base}models/${next.model}`),
      classifier = await Vision.ImageClassifier.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: bytes, delegate: "CPU" },
        runningMode: "IMAGE",
        maxResults: 1,
      });
    if (finer === mine) {
      mine.classifier = classifier;
      mine.state = "ready";
    } else classifier.close();
  } catch (error) {
    mine.state = "failed";
    mine.note = error instanceof Error ? error.message : String(error);
  }
}
// The crop is given to the classifier as a region of interest of the frame.
// A box that has no area once clamped to the image has no region: null.
const regionOf = (box) => {
  const region = {
    left: Math.max(0, box.x),
    top: Math.max(0, box.y),
    right: Math.min(1, box.x + box.w),
    bottom: Math.min(1, box.y + box.h),
  };
  return region.right - region.left > 1e-4 && region.bottom - region.top > 1e-4
    ? region
    : null;
};
function withFiner(fields, bitmap) {
  if (!finer) return fields;
  const cfg = finer.cfg,
    info = { state: finer.state, floor: cfg.floor, ms: 0, classified: 0 };
  if (finer.state === "failed") info.note = finer.note;
  if (finer.state !== "ready")
    return { ...fields, extra: { ...fields.extra, finer: info } };
  const now = performance.now(),
    dets = fields.detections,
    plan = planFiner(memory, dets, now, cfg),
    next = [];
  const started = performance.now();
  dets.forEach((d, i) => {
    let entry = plan.reuse.get(i) ?? null,
      answer = entry ? entry.finer : null;
    if (plan.todo.includes(i)) {
      // A crop that cannot be classified (no area, or one error) is skipped:
      // it has no name this pass and is tried again after `everyMs`. It never
      // turns the feature off.
      const region = regionOf(d.box);
      answer = null;
      if (region) {
        try {
          const top = finer.classifier.classify(bitmap, {
            regionOfInterest: region,
          }).classifications[0]?.categories[0];
          if (top && top.score >= cfg.floor)
            answer = { label: top.categoryName, score: top.score };
          info.classified++;
        } catch {
          info.skipped = (info.skipped ?? 0) + 1;
        }
      }
      entry = { at: now };
    }
    next.push({
      box: d.box,
      label: d.label,
      finer: answer,
      at: entry ? entry.at : NEVER,
    });
    if (answer) d.finer = answer;
  });
  memory = next;
  info.ms = performance.now() - started;
  return { ...fields, extra: { ...fields.extra, finer: info } };
}

// Everything that differs between task kinds lives in this one switch:
//   create      builds the MediaPipe task from the resolved options
//   run         runs it on one frame
//   confidence  maps the Confidence slider to task options (null: filter in `read`)
//   read        normalizes the raw output into the TaskResult fields
function handlerFor(kind) {
  switch (kind) {
    case "object":
      return {
        create: (files, options) =>
          Vision.ObjectDetector.createFromOptions(files, options),
        run: detect,
        confidence: null,
        read,
      };
    case "pose":
      return {
        create: (files, options) =>
          Vision.PoseLandmarker.createFromOptions(files, options),
        run: detect,
        confidence: (value) => ({
          minPoseDetectionConfidence: value,
          minPosePresenceConfidence: value,
        }),
        read: readPose,
      };
    case "hand":
      return {
        create: (files, options) =>
          Vision.HandLandmarker.createFromOptions(files, options),
        run: detect,
        confidence: (value) => ({
          minHandDetectionConfidence: value,
          minHandPresenceConfidence: value,
        }),
        read: readWorld,
      };
    case "face":
      return {
        create: (files, options) =>
          Vision.FaceLandmarker.createFromOptions(files, options),
        run: detect,
        confidence: (value) => ({
          minFaceDetectionConfidence: value,
          minFacePresenceConfidence: value,
        }),
        read: readFace,
      };
    case "gesture":
      return {
        create: (files, options) =>
          Vision.GestureRecognizer.createFromOptions(files, options),
        run: (task, bitmap, time) => task.recognizeForVideo(bitmap, time),
        confidence: (value) => ({
          minHandDetectionConfidence: value,
          minHandPresenceConfidence: value,
        }),
        read: readGesture,
      };
    case "segment":
      return segmentHandler();
    default:
      throw new Error(`Unknown vision task "${kind}".`);
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      spec = data.task;
      workerBase = data.base;
      handler = handlerFor(spec.kind);
      importScripts(`${data.base}runtime/vision_bundle.js`);
      files = await Vision.FilesetResolver.forVisionTasks(
        `${data.base}runtime/wasm`,
      );
      // The downloads happen here, not inside MediaPipe, so that the page
      // can be told when the bytes are in: how long a GPU task may take to
      // start is counted from then, not from a slow connection's first byte.
      // The wasm is fetched only to have it in the browser's cache.
      const [model] = await Promise.all([
        download(`${data.base}models/${spec.model}`),
        typeof files.wasmBinaryPath === "string"
          ? download(files.wasmBinaryPath).then(() => null)
          : null,
      ]);
      self.postMessage({ type: "downloaded" });
      const { finer: initial, ...options } = spec.options ?? {};
      let wanted = initial;
      task = await handler.create(files, {
        baseOptions: {
          modelAssetBuffer: model,
          delegate: spec.delegate,
        },
        runningMode: "VIDEO",
        ...options,
      });
      if (pending) {
        const { finer: asked, ...rest } = pending;
        pending = null;
        if (Object.keys(rest).length) await task.setOptions(rest);
        if (asked !== undefined) wanted = asked;
      }
      // The detector is ready now; the classifier loads in the background.
      void setFiner(spec.kind === "object" ? wanted : null, data.base);
      self.postMessage({
        type: "ready",
        delegate: spec.delegate,
        files: fetchedFiles(data.base, spec.model, files),
      });
    } else if (data.type === "options") {
      const { finer: asked, ...rest } = data.options;
      if (!task) pending = { ...pending, ...data.options };
      else {
        if (Object.keys(rest).length) await task.setOptions(rest);
        if (asked !== undefined && spec.kind === "object")
          void setFiner(asked, workerBase);
      }
    } else if (data.type === "frame") {
      const { bitmap, generation, confidence } = data;
      if (!task) {
        bitmap.close();
        return;
      }
      if (handler.confidence && confidence !== threshold) {
        await task.setOptions(handler.confidence(confidence));
        threshold = confidence;
      }
      // A new source must not inherit the preceding video's tracking crop.
      if (generation !== sourceGeneration) {
        // Names belong to the picture they were computed on.
        memory = [];
        await task.setOptions({ runningMode: "IMAGE" });
        await task.setOptions({ runningMode: "VIDEO" });
        sourceGeneration = generation;
      }
      const time = Math.max(data.time, lastTime + 1);
      lastTime = time;
      const start = performance.now();
      try {
        const output = handler.run(task, bitmap, time),
          latency = performance.now() - start;
        // `transfer` lists buffers (masks) to move to the page instead of copying.
        const { transfer = [], ...fields } = withFiner(
          handler.read(output, bitmap, confidence),
          bitmap,
        );
        self.postMessage(
          {
            type: "result",
            result: {
              kind: spec.kind,
              delegate: spec.delegate,
              generation,
              time,
              latency: latency + (fields.extra?.finer?.ms ?? 0),
              ...fields,
            },
          },
          transfer,
        );
      } finally {
        bitmap.close();
      }
    }
  } catch (error) {
    if (data.bitmap)
      try {
        data.bitmap.close();
      } catch {}
    self.postMessage({
      type: "error",
      error: `Vision model failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};
