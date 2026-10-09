/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { COLORS } from "../vision/types";
import type { TaskResult } from "../vision/types";
import { GestureLog, NO_GESTURE, gestureName } from "./lib/gesture-log";
import { drawChip, drawHand } from "./lib/hud";
import { gestureExtra } from "./lib/task-extras";
import type { InspectorRow, ModeDef } from "./types";

// Row keys: hands first, then the gestures seen so far.
const SEEN_KEY = 100;
const WRIST = 0;

// Gestures seen on the current source. The log is fed once per model result,
// from whichever of drawBase and inspector sees that result first, and starts
// over when the source changes.
const log = new GestureLog();
let logged: TaskResult | null = null,
  generation = -1;
function observe(task: TaskResult | undefined) {
  if (!task || task === logged) return;
  logged = task;
  if (task.generation !== generation) {
    generation = task.generation;
    log.reset();
  }
  const gestures = gestureExtra(task)?.gestures ?? [];
  log.update(
    gestures.flatMap((gesture, i) => {
      const wrist = task.landmarks[i]?.[WRIST];
      return wrist
        ? [{ name: gesture.name, handedness: gesture.handedness, at: wrist }]
        : [];
    }),
  );
}
const percent = (score: number) => `${Math.round(score * 100)}%`;

const gestures: ModeDef = {
  id: "gestures",
  label: "Gesture recognition",
  short: "Gestures",
  order: 60,
  task: {
    kind: "gesture",
    model: "gesture_recognizer.task",
    options: {
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.5,
    },
    delegate: "AUTO",
  },
  hint: "Show a thumb up, a victory sign, a fist or an open palm.",
  demo: {
    still: "demo/hands.png",
    motion: "demo/hands-motion.mp4",
    label: "Demo hands",
  },
  // Each hand's skeleton with the recognized gesture and its score above it.
  drawBase(ctx, frame) {
    const task = frame.result?.tasks.gesture;
    if (!task) return;
    observe(task);
    const found = gestureExtra(task)?.gestures ?? [];
    task.landmarks.forEach((landmarks, index) => {
      const color = COLORS[index % COLORS.length],
        gesture = found[index],
        box = task.detections[index]?.box;
      frame.emit("before", "gesture", index);
      drawHand(ctx, frame, landmarks, color);
      if (gesture && box) {
        const corner = frame.project({
          x: frame.mirror ? box.x + box.w : box.x,
          y: box.y,
        });
        drawChip(
          ctx,
          frame,
          gesture.name === NO_GESTURE
            ? gestureName(gesture.name)
            : `${gestureName(gesture.name)}  ${percent(gesture.score)}`,
          corner.x,
          corner.y - 31,
          color,
        );
      }
      frame.emit("after", "gesture", index);
    });
  },
  // The log rows are history, not hands in the frame.
  count: (frame) => frame.result?.tasks.gesture?.landmarks.length ?? 0,
  exportFrame(result) {
    const extra = gestureExtra(result.tasks.gesture);
    return extra ? { gestures: extra.gestures } : {};
  },
  // The hands in the frame with what each is doing, then every gesture seen
  // on this source with how many times it was made.
  inspector(frame) {
    const task = frame.result?.tasks.gesture;
    if (!task) return [];
    observe(task);
    const found = gestureExtra(task)?.gestures ?? [];
    const rows: InspectorRow[] = task.landmarks.flatMap((landmarks, i) => {
      const gesture = found[i];
      if (!gesture || !landmarks[WRIST]) return [];
      return [
        {
          key: i + 1,
          label: `${gesture.handedness} hand`,
          detail:
            gesture.name === NO_GESTURE
              ? gestureName(gesture.name)
              : `${gestureName(gesture.name)} ${percent(gesture.score)}`,
          point: landmarks[WRIST],
          color: COLORS[i % COLORS.length],
        },
      ];
    });
    log.counts().forEach((entry, i) =>
      rows.push({
        key: SEEN_KEY + i,
        label: gestureName(entry.name),
        detail: entry.count === 1 ? "seen once" : `seen ${entry.count} times`,
        point: entry.at,
        color: entry.active ? "#f3f7f6" : "#b1bec3",
      }),
    );
    return rows;
  },
};
export default gestures;
