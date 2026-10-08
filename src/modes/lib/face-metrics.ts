/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pure helpers that turn the face model's raw output into the few numbers the
// inspector shows. No DOM and no canvas here, so they are unit-tested.

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

export type HeadPose = { yaw: number; pitch: number; roll: number };
const degrees = (radians: number) => (radians * 180) / Math.PI;

/** Head rotation in degrees from the 4x4 facial transformation matrix
 * (column-major, x right, y up, z toward the camera). Yaw is positive when the
 * face turns toward the right of the image, pitch when it tilts up, roll when
 * it leans counter-clockwise as seen in the image. Null for a malformed matrix. */
export function headPose(
  matrix: readonly number[] | undefined,
): HeadPose | null {
  if (!matrix || matrix.length < 16) return null;
  // The upper-left 3x3 may carry a uniform scale: divide it out.
  const scale = Math.hypot(matrix[0], matrix[1], matrix[2]);
  if (!Number.isFinite(scale) || scale < 1e-6) return null;
  // Where the face's forward (z) axis points, and how its x axis is rolled.
  const fx = matrix[8] / scale,
    fy = matrix[9] / scale,
    fz = matrix[10] / scale;
  return {
    yaw: degrees(Math.atan2(fx, fz)),
    pitch: degrees(Math.asin(Math.min(1, Math.max(-1, fy)))),
    roll: degrees(Math.atan2(matrix[1], matrix[5])),
  };
}

const signed = (value: number) => `${Math.round(value) || 0}°`;
export const poseText = (pose: HeadPose) =>
  `yaw ${signed(pose.yaw)} · pitch ${signed(pose.pitch)} · roll ${signed(pose.roll)}`;
