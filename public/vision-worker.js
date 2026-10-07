/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 * Original worker orchestration; MediaPipe runtime and models retain Apache-2.0 rights. */
// One worker runs one vision task. Protocol (documented in docs/architecture.md):
//   in  { type: "init", base, task: TaskSpec }                  out { type: "ready", delegate }
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
    // ---- MODELS LANE: implement these three kinds here and nowhere else. ----
    // Return the same four functions; put kind-specific output (blendshapes,
    // masks, gesture names) in an `extra` object returned from `read`.
    case "face":
    case "segment":
    case "gesture":
      throw new Error(`Vision task "${kind}" is not implemented yet.`);
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
      self.postMessage({ type: "ready", delegate: spec.delegate });
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
        self.postMessage({
          type: "result",
          result: {
            kind: spec.kind,
            delegate: spec.delegate,
            generation,
            time,
            latency,
            ...handler.read(output, bitmap, confidence),
          },
        });
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
