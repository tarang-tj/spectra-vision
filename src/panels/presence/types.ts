/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Shared types and constants of the Presence panel. Pure: no DOM, no clock.

/** Two results further apart than this (ms) mean the stage stopped between
 * them (paused, hidden, or a stalled source). The gap is left out of every
 * duration and no speed is taken across it. */
export const MAX_STEP_MS = 1500;
/** Standard calibration length: the person holds still and faces the camera. */
export const CALIBRATION_MS = 5000;
/** Fewest calibration samples a noise figure may be computed from. */
export const MIN_CALIBRATION_SAMPLES = 5;

/** The settings the user may change. Every one is a stated threshold, shown
 * in the panel and written to the export. */
export type Thresholds = {
  /** Degrees. Head direction within this angle of the baseline counts as "toward". */
  headAngle: number;
  /** Shoulder widths per second. A hand faster than this is moving. */
  handSpeed: number;
  /** Ms. A hand must be slower than `handSpeed` this long before a start counts. */
  handStill: number;
  /** Whole-body motion at or under this multiple of the noise floor is still. */
  stillMultiple: number;
};
export const DEFAULT_THRESHOLDS: Thresholds = {
  headAngle: 15,
  handSpeed: 0.5,
  handStill: 300,
  stillMultiple: 3,
};
export const THRESHOLD_LIMITS: Record<
  keyof Thresholds,
  { min: number; max: number; step: number }
> = {
  headAngle: { min: 1, max: 90, step: 1 },
  handSpeed: { min: 0.05, max: 10, step: 0.05 },
  handStill: { min: 50, max: 5000, step: 50 },
  stillMultiple: { min: 1, max: 20, step: 0.5 },
};

// Lengths are in image-height units (x is multiplied by width / height), so
// x and y are on one scale. Dividing by the calibration shoulder width gives
// "shoulder widths". Angles are degrees.

/** One new face result. Null in `Signals.face` means the task ran and saw no usable face. */
export type FaceSample = {
  t: number;
  yaw: number;
  pitch: number;
  /** Mean absolute change per second of smile, brow raise and jaw open since
   * the previous face sample; NaN for the first sample or after a gap. */
  change: number;
  /** Nose tip, image-normalized, for the stage overlay. */
  nose: { x: number; y: number } | null;
};
export type PoseSample = {
  t: number;
  /** Shoulder midpoint, sideways, image-height units. */
  x: number;
  /** Shoulder distance, image-height units. */
  width: number;
  /** Mean speed of shoulders, elbows, wrists and hips (height units / s); NaN if none paired. */
  motion: number;
  /** Mean speed of the wrists relative to the hips from world landmarks, m/s; NaN if unavailable. */
  worldSpeed: number;
};
export type HandSample = {
  t: number;
  /** Hands in view, by the label the model gave. `speed` is the palm centre's
   * speed (height units / s), NaN for a hand with no previous sample. */
  hands: { label: string; speed: number }[];
};
/** What one merged result adds. `undefined` = that task produced nothing new. */
export type Signals = {
  t: number;
  face?: FaceSample | null;
  pose?: PoseSample | null;
  hand?: HandSample;
};
export type TaskName = "face" | "pose" | "hand";
export const TASKS: TaskName[] = ["face", "pose", "hand"];

/** Everything recorded while measuring. */
export type Recording = {
  face: FaceSample[];
  pose: PoseSample[];
  hand: HandSample[];
  /** New results per task, and how many of them saw the person. */
  fresh: Record<TaskName, number>;
  seen: Record<TaskName, number>;
  /** Result-clock time covered, gaps left out (ms), and results counted in it. */
  coveredMs: number;
  results: number;
  /** Results that added time to `coveredMs` (not the first after a gap). */
  steps: number;
  /** Times the stage stopped and resumed during measuring. */
  pauses: number;
};
export const emptyRecording = (): Recording => ({
  face: [],
  pose: [],
  hand: [],
  fresh: { face: 0, pose: 0, hand: 0 },
  seen: { face: 0, pose: 0, hand: 0 },
  coveredMs: 0,
  results: 0,
  steps: 0,
  pauses: 0,
});
