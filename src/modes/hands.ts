import { strokePath } from "../vision/draw";
import { HAND_EDGES, isPinching } from "../vision/geometry";
import { COLORS } from "../vision/types";
import type { ModeDef } from "./types";

const hands: ModeDef = {
  id: "hands",
  label: "Hand tracking",
  short: "Hands",
  order: 30,
  task: {
    kind: "hand",
    model: "hand_landmarker.task",
    options: {
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.5,
    },
    delegate: "CPU",
  },
  hint: "Pinch thumb + index to paint. Release to stop.",
  demo: {
    still: "demo/hands.png",
    motion: "demo/hands-motion.mp4",
    label: "Demo hands",
  },
  // Pinch painting leaves strokes on the stage, so offer the Clear tool.
  clearable: true,
  // Hand skeleton, larger thumb and index tips, and a ring on the index tip.
  // Hand landmarks report a visibility of zero, so it is never used as a filter.
  drawBase(ctx, frame) {
    const result = frame.result;
    if (!result) return;
    // The ring breathes only when animation is allowed (not paused, no reduced motion).
    const clock = frame.animate ? frame.time : 0;
    result.landmarks.forEach((landmarks, index) => {
      const color = COLORS[index % COLORS.length];
      frame.emit("before", "hand", index);
      HAND_EDGES.forEach(([a, b]) => {
        if (landmarks[a] && landmarks[b])
          strokePath(ctx, frame, [landmarks[a], landmarks[b]], color, 2.5, 9);
      });
      landmarks.forEach((p, i) => {
        const q = frame.project(p);
        ctx.beginPath();
        ctx.arc(q.x, q.y, i === 4 || i === 8 ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 8 ? "#ffffff" : color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      if (landmarks[8]) {
        const q = frame.project(landmarks[8]);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 12 + 2 * Math.sin(clock / 180), 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      frame.emit("after", "hand", index);
    });
  },
  inspector: (frame) =>
    (frame.result?.landmarks ?? []).map((points, i) => ({
      key: i + 1,
      label: `${frame.result?.handedness[i] ?? "Hand"} hand`,
      detail: isPinching(points, false, frame.aspect) ? "Pinching" : "Open",
      point: points[0],
      color: COLORS[i % COLORS.length],
    })),
};
export default hands;
