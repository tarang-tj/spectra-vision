/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 * Original worker orchestration; MediaPipe runtime and models retain Apache-2.0 rights. */
// One worker runs one vision task. Protocol (documented in docs/architecture.md):
//   in  { type: "init", base, task: TaskSpec }                  out { type: "ready", delegate, files }
//   in  { type: "frame", bitmap, time, generation, confidence } out { type: "result", result: TaskResult }
//   any failure                                                 out { type: "error", error }
// A failed GPU start is not retried here: the page decides, and restarts this
// worker on CPU (src/vision/delegate.ts), which also discards any broken GL state.
let task,
  spec,
  handler,
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

// What this worker fetched from the site to get ready: the runtime script,
// the wasm files MediaPipe chose and the model. The page hands the list to the
// service worker, so a file is kept for offline use only after it was used.
function fetchedFiles(base, model) {
  const files = new Set([
    `${base}runtime/vision_bundle.js`,
    `${base}models/${model}`,
  ]);
  try {
    for (const entry of performance.getEntriesByType("resource"))
      if (entry.name.startsWith(base)) files.add(entry.name);
  } catch {
    /* No resource timing here: the two files above are still certain. */
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
    return /swiftshader|llvmpipe|software/i.test(name) ? name : "";
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
        read,
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
        read,
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
      handler = handlerFor(spec.kind);
      importScripts(`${data.base}runtime/vision_bundle.js`);
      const files = await Vision.FilesetResolver.forVisionTasks(
        `${data.base}runtime/wasm`,
      );
      task = await handler.create(files, {
        baseOptions: {
          modelAssetPath: `${data.base}models/${spec.model}`,
          delegate: spec.delegate,
        },
        runningMode: "VIDEO",
        ...spec.options,
      });
      self.postMessage({
        type: "ready",
        delegate: spec.delegate,
        files: fetchedFiles(data.base, spec.model),
      });
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
        const { transfer = [], ...fields } = handler.read(
          output,
          bitmap,
          confidence,
        );
        self.postMessage(
          {
            type: "result",
            result: {
              kind: spec.kind,
              delegate: spec.delegate,
              generation,
              time,
              latency,
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
