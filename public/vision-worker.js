/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 * Original worker orchestration; MediaPipe runtime and models retain Apache-2.0 rights. */
let task,
  mode,
  lastTime = -1,
  sourceGeneration = -1,
  threshold = 0.45;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      mode = data.mode;
      importScripts(`${data.base}runtime/vision_bundle.js`);
      const files = await Vision.FilesetResolver.forVisionTasks(
        `${data.base}runtime/wasm`,
      );
      const options = {
        baseOptions: {
          modelAssetPath: `${data.base}models/${mode === "objects" ? "efficientdet_lite0.tflite" : mode === "body" ? "pose_landmarker_lite.task" : "hand_landmarker.task"}`,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
      };
      task =
        mode === "objects"
          ? await Vision.ObjectDetector.createFromOptions(files, {
              ...options,
              scoreThreshold: 0.1,
              maxResults: 20,
            })
          : mode === "body"
            ? await Vision.PoseLandmarker.createFromOptions(files, {
                ...options,
                numPoses: 1,
                minPoseDetectionConfidence: 0.45,
                minPosePresenceConfidence: 0.45,
                minTrackingConfidence: 0.5,
              })
            : await Vision.HandLandmarker.createFromOptions(files, {
                ...options,
                numHands: 2,
                minHandDetectionConfidence: 0.45,
                minHandPresenceConfidence: 0.45,
                minTrackingConfidence: 0.5,
              });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      const { bitmap, generation, confidence } = data;
      if (!task) {
        bitmap.close();
        return;
      }
      if (mode !== "objects" && confidence !== threshold) {
        await task.setOptions(
          mode === "body"
            ? {
                minPoseDetectionConfidence: confidence,
                minPosePresenceConfidence: confidence,
              }
            : {
                minHandDetectionConfidence: confidence,
                minHandPresenceConfidence: confidence,
              },
        );
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
        const output = task.detectForVideo(bitmap, time),
          latency = performance.now() - start;
        const detections = (output.detections ?? [])
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
          .filter((d) => d.score >= confidence);
        self.postMessage({
          type: "result",
          result: {
            mode,
            generation,
            time,
            latency,
            detections,
            landmarks: output.landmarks ?? [],
            handedness: (output.handedness ?? []).map(
              (h) => h[0]?.categoryName ?? "Hand",
            ),
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
