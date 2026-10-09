/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pure helpers that turn the face model's raw output into the few numbers the
// inspector shows. No DOM and no canvas here, so they are unit-tested.

// The head-pose maths lives in the measurement core (src/measure/angles.ts);
// the face mode keeps importing it from here.
import { headPose } from "../../measure/angles";
import type { HeadPose } from "../../measure/angles";
export { headPose };
export type { HeadPose };

export type Meter = {
  id: string;
  label: string;
  /** The model's score, 0..1. */
  value: number;
  /** Face landmark the meter is about (its dot on the motion map). */
  anchor: number;
};

const score = (shapes: Record<string, number>, name: string) => {
  const value = shapes[name];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
};

/** The five expressions the inspector shows, read from MediaPipe blendshape
 * scores. "Left" and "right" are the subject's own left and right, as the
 * model names them. Two-sided expressions average their two sides. */
export function faceMeters(shapes: Record<string, number>): Meter[] {
  return [
    {
      id: "smile",
      label: "Smile",
      value:
        (score(shapes, "mouthSmileLeft") + score(shapes, "mouthSmileRight")) /
        2,
      anchor: 13,
    },
    {
      id: "jaw",
      label: "Jaw open",
      value: score(shapes, "jawOpen"),
      anchor: 152,
    },
    {
      id: "brow",
      label: "Brow raise",
      value: Math.max(
        score(shapes, "browInnerUp"),
        (score(shapes, "browOuterUpLeft") + score(shapes, "browOuterUpRight")) /
          2,
      ),
      anchor: 9,
    },
    {
      id: "blink-left",
      label: "Blink left",
      value: score(shapes, "eyeBlinkLeft"),
      anchor: 386,
    },
    {
      id: "blink-right",
      label: "Blink right",
      value: score(shapes, "eyeBlinkRight"),
      anchor: 159,
    },
  ];
}

const CELLS = 8;
/** A text meter for the inspector row: filled and empty cells, then the percentage. */
export function meterText(value: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)),
    filled = Math.round(clamped * CELLS);
  return `${"▰".repeat(filled)}${"▱".repeat(CELLS - filled)} ${Math.round(clamped * 100)}%`;
}

const signed = (value: number) => `${Math.round(value) || 0}°`;
export const poseText = (pose: HeadPose) =>
  `yaw ${signed(pose.yaw)} · pitch ${signed(pose.pitch)} · roll ${signed(pose.roll)}`;
