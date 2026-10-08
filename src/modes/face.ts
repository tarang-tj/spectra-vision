/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { COLORS } from "../vision/types";
import { drawFace } from "./lib/face-draw";
import { faceMeters, headPose, meterText, poseText } from "./lib/face-metrics";
import { faceExtra } from "./lib/task-extras";
import type { InspectorRow, ModeDef } from "./types";

// Row keys: five expression meters, then the head pose.
const POSE_KEY = 6;
const NOSE_TIP = 1;

const face: ModeDef = {
  id: "face",
  label: "Face mesh",
  short: "Face",
  order: 40,
  task: {
    kind: "face",
    model: "face_landmarker.task",
    options: {
      numFaces: 1,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    },
    delegate: "CPU",
  },
  hint: "Face the camera. Smile, blink or raise your brows.",
  // A crop of the generated demo studio image: no real person is shown.
  demo: { still: "demo/face.png", label: "Demo studio · portrait crop" },
  // The 478-point mesh: faint tesselation, glowing contours, irises.
  drawBase(ctx, frame) {
    const faces = frame.result?.tasks.face?.landmarks;
    if (!faces) return;
    for (let index = 0; index < faces.length; index++) {
      frame.emit("before", "face", index);
      drawFace(ctx, frame, faces[index], COLORS[index % COLORS.length], true);
      frame.emit("after", "face", index);
    }
  },
  // Measured expression scores as meters, then the head pose. Nothing is
  // listed until the model has found a face.
  inspector(frame) {
    const task = frame.result?.tasks.face,
      points = task?.landmarks[0],
      extra = faceExtra(task);
    if (!points?.length || !extra) return [];
    const rows: InspectorRow[] = [],
      shapes = extra.blendshapes[0];
    if (shapes)
      faceMeters(shapes).forEach((meter, i) =>
        rows.push({
          key: i + 1,
          label: meter.label,
          detail: meterText(meter.value),
          point: points[meter.anchor] ?? points[NOSE_TIP],
          color: COLORS[i % COLORS.length],
        }),
      );
    const pose = headPose(extra.matrices[0]);
    if (pose)
      rows.push({
        key: POSE_KEY,
        label: "Head pose",
        detail: poseText(pose),
        point: points[NOSE_TIP],
        color: "#f3f7f6",
      });
    return rows;
  },
};
export default face;
