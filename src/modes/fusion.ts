/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { strokePath } from "../vision/draw";
import { POSE_EDGES } from "../vision/geometry";
import type { Frame } from "../vision/frame";
import type { Point, TaskKind } from "../vision/types";
import { drawFace } from "./lib/face-draw";
import {
  POSE_FACE_POINTS,
  POSE_HAND_POINTS,
  attachHands,
  seen,
} from "./lib/fusion-figure";
import { drawChip, drawHand } from "./lib/hud";
import type { InspectorRow, ModeDef } from "./types";

// One colour per model, shared by the figure, the inspector and the motion map.
const PARTS: { kind: TaskKind; name: string; color: string }[] = [
  { kind: "pose", name: "Body", color: "#a4ffd9" },
  { kind: "hand", name: "Hands", color: "#67aaff" },
  { kind: "face", name: "Face", color: "#ae94fa" },
];
const [BODY, HANDS, FACE] = PARTS;
const HAND_KEY = 10,
  FACE_KEY = 20;
const ms = (latency: number) => `${Math.round(latency)} ms`;

// The body, without the parts a better model has taken over: the pose model's
// face points when the face mesh is there, its finger stubs where a hand is.
function drawBody(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  pose: Point[],
  skip: Set<number>,
) {
  const torso = [11, 12, 24, 23].map((i) => pose[i]);
  if (torso.every(seen)) {
    ctx.beginPath();
    torso.forEach((p, i) => {
      const q = frame.project(p);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fillStyle = "#a4ffd917";
    ctx.fill();
  }
  for (const [a, b] of POSE_EDGES)
    if (!skip.has(a) && !skip.has(b) && seen(pose[a]) && seen(pose[b]))
      strokePath(ctx, frame, [pose[a], pose[b]], BODY.color, 2.5, 9);
  ctx.shadowColor = BODY.color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = BODY.color;
  pose.forEach((p, i) => {
    if (skip.has(i) || !seen(p)) return;
    const q = frame.project(p);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}

const fusion: ModeDef = {
  id: "fusion",
  label: "Full-body fusion",
  short: "Fusion",
  order: 70,
  // One worker per model. Pose is primary: it fills the flat result fields.
  task: [
    {
      kind: "pose",
      model: "pose_landmarker_lite.task",
      preciseModel: "pose_landmarker_full.task",
      options: {
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.5,
      },
      delegate: "AUTO",
    },
    {
      kind: "hand",
      model: "hand_landmarker.task",
      options: {
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.5,
      },
      delegate: "AUTO",
    },
    {
      kind: "face",
      model: "face_landmarker.task",
      options: {
        numFaces: 1,
        // Presence reads head direction from the matrix and expression change
        // from the blendshapes; without these two the face is drawn but
        // nothing about it can be measured.
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.5,
      },
      delegate: "CPU",
    },
  ],
  hint: "Step back until your body, hands and face are all in the frame.",
  // A crop of the generated demo studio image, tight enough for the face
  // model to find the face while a hand is still in view. In the full image
  // the face is too small for it. No real person is shown.
  demo: {
    still: "demo/face-and-hands.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio · upper-body crop",
  },
  // Body, hands and face as one figure. Each part is drawn only from its own
  // model's latest result; a strip shows what every model took for its frame.
  drawBase(ctx, frame) {
    const tasks = frame.result?.tasks;
    if (!tasks) return;
    const pose = tasks.pose?.landmarks[0],
      hands = tasks.hand?.landmarks ?? [],
      face = tasks.face?.landmarks[0],
      wrists = attachHands(pose, hands, frame.aspect);
    if (pose) {
      const skip = new Set<number>();
      if (face) for (let i = 0; i < POSE_FACE_POINTS; i++) skip.add(i);
      for (const wrist of wrists)
        if (wrist !== null) POSE_HAND_POINTS[wrist].forEach((i) => skip.add(i));
      frame.emit("before", "pose", 0);
      drawBody(ctx, frame, pose, skip);
      frame.emit("after", "pose", 0);
    }
    hands.forEach((landmarks, index) => {
      const wrist = wrists[index];
      frame.emit("before", "hand", index);
      // Join the hand to the arm it belongs to.
      if (pose && wrist !== null && landmarks[0])
        strokePath(ctx, frame, [pose[wrist], landmarks[0]], BODY.color, 2.5, 9);
      drawHand(ctx, frame, landmarks, HANDS.color);
      frame.emit("after", "hand", index);
    });
    if (face) {
      frame.emit("before", "face", 0);
      drawFace(ctx, frame, face, FACE.color, false);
      frame.emit("after", "face", 0);
    }
    const timing = PARTS.flatMap((part) => {
      const task = tasks[part.kind];
      return task ? [`${part.name.toUpperCase()} ${ms(task.latency)}`] : [];
    });
    if (timing.length)
      drawChip(
        ctx,
        frame,
        timing.join("  ·  "),
        frame.rect.x + 12,
        frame.rect.y + 48,
        "#f3f7f6",
      );
  },
  // The latest result of each of the three models, with its own frame time,
  // latency and delegate. The flat v1 keys carry the pose model's only.
  exportFrame: (result) => ({
    tasks: Object.fromEntries(
      Object.entries(result.tasks).map(([kind, task]) => [
        kind,
        {
          elapsedMs: Math.round(task.time),
          latencyMs: task.latency,
          delegate: task.delegate,
          landmarks: task.landmarks,
          handedness: task.handedness,
        },
      ]),
    ),
  }),
  // One row per part found, with the measured latency of the model behind it.
  inspector(frame) {
    const tasks = frame.result?.tasks;
    if (!tasks) return [];
    const rows: InspectorRow[] = [],
      pose = tasks.pose?.landmarks[0],
      face = tasks.face?.landmarks[0];
    if (tasks.pose && pose)
      rows.push({
        key: 1,
        label: BODY.name,
        detail: `${pose.length} points · ${ms(tasks.pose.latency)}`,
        point: pose[23] ?? pose[0],
        color: BODY.color,
      });
    tasks.hand?.landmarks.forEach((points, i) => {
      if (points[0])
        rows.push({
          key: HAND_KEY + i,
          label: `${tasks.hand?.handedness[i] ?? "Hand"} hand`,
          detail: `${points.length} points · ${ms(tasks.hand?.latency ?? 0)}`,
          point: points[0],
          color: HANDS.color,
        });
    });
    if (tasks.face && face)
      rows.push({
        key: FACE_KEY,
        label: FACE.name,
        detail: `${face.length} points · ${ms(tasks.face.latency)}`,
        point: face[1] ?? face[0],
        color: FACE.color,
      });
    return rows;
  },
};
export default fusion;
