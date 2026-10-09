import { strokePath } from "../vision/draw";
import { POSE_EDGES } from "../vision/geometry";
import { COLORS } from "../vision/types";
import type { Point } from "../vision/types";
import { peopleOption } from "./lib/people";
import PeopleSetting from "./lib/people-setting";
import type { ModeDef } from "./types";

// Pose landmarks below this visibility are treated as not seen.
const VISIBLE = 0.4;
const seen = (p: Point | undefined) => !!p && (p.visibility ?? 1) > VISIBLE;

const body: ModeDef = {
  id: "body",
  label: "Body tracking",
  short: "Body",
  order: 20,
  task: {
    kind: "pose",
    model: "pose_landmarker_lite.task",
    preciseModel: "pose_landmarker_full.task",
    options: {
      numPoses: 1,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.5,
    },
    // Followed people: the People setting (modes/lib/people.ts).
    live: peopleOption,
    delegate: "AUTO",
  },
  controls: PeopleSetting,
  hint: "Step back. Keep your whole body in the frame.",
  demo: {
    still: "demo/studio.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio",
  },
  // A shaded torso, the skeleton, then one dot per visible landmark.
  drawBase(ctx, frame) {
    const result = frame.result;
    if (!result) return;
    result.landmarks.forEach((landmarks, index) => {
      const color = COLORS[index % COLORS.length];
      frame.emit("before", "pose", index);
      const torso = [11, 12, 24, 23].map((i) => landmarks[i]);
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
        strokePath(ctx, frame, [torso[0], torso[2]], "#a4ffd977", 1);
        strokePath(ctx, frame, [torso[1], torso[3]], "#a4ffd977", 1);
      }
      POSE_EDGES.forEach(([a, b]) => {
        if (seen(landmarks[a]) && seen(landmarks[b]))
          strokePath(ctx, frame, [landmarks[a], landmarks[b]], color, 2.5, 9);
      });
      landmarks.forEach((p, i) => {
        if ((p.visibility ?? 1) < VISIBLE) return;
        const q = frame.project(p);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 8 ? "#ffffff" : color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      frame.emit("after", "pose", index);
    });
  },
  inspector: (frame) =>
    (frame.result?.landmarks ?? []).map((points, i) => ({
      key: i + 1,
      label: "Body",
      detail: `${points.length} landmarks`,
      point: points[23],
      color: COLORS[i % COLORS.length],
    })),
};
export default body;
