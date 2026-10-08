/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type {
  FaceExtra,
  GestureExtra,
  SegmentExtra,
  TaskResult,
} from "../../vision/types";

// `TaskResult.extra` is an open record, so every reader would otherwise repeat
// the same cast. These return the typed payload, or null when the result is
// missing or is not of that kind. Modes and effects can both use them:
//   const seg = segmentExtra(frame.result?.tasks.segment);

/** Blendshape scores and transformation matrices of a "face" result. */
export function faceExtra(result: TaskResult | undefined): FaceExtra | null {
  const extra = result?.kind === "face" ? result.extra : undefined;
  return extra &&
    Array.isArray(extra.blendshapes) &&
    Array.isArray(extra.matrices)
    ? (extra as FaceExtra)
    : null;
}

/** Top gesture of every hand of a "gesture" result. */
export function gestureExtra(
  result: TaskResult | undefined,
): GestureExtra | null {
  const extra = result?.kind === "gesture" ? result.extra : undefined;
  return extra && Array.isArray(extra.gestures)
    ? (extra as GestureExtra)
    : null;
}

/** Class and matte masks of a "segment" result, with per-class measurements. */
export function segmentExtra(
  result: TaskResult | undefined,
): SegmentExtra | null {
  const extra = result?.kind === "segment" ? result.extra : undefined;
  return extra &&
    extra.mask instanceof Uint8Array &&
    extra.alpha instanceof Uint8Array &&
    Array.isArray(extra.classes)
    ? (extra as SegmentExtra)
    : null;
}
