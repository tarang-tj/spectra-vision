/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Pure rules of Mirror: joint angles from pose landmarks, how alike two poses
// are, and the hold-to-lock timer. No DOM, canvas or audio.
import type { Point } from "../../vision/types";

/** Joint order used everywhere: shoulder, elbow (left then right), then hip,
 * knee (left then right). "Left" is the person's own left, as the model says. */
export const JOINTS = 8;
// Landmark indexes of the pose model: [parent, joint, child] per limb segment.
const SHOULDER_L = 11,
  SHOULDER_R = 12,
  HIP_L = 23,
  HIP_R = 24;
export const LIMBS = [
  [SHOULDER_L, 13, 15],
  [SHOULDER_R, 14, 16],
  [HIP_L, 25, 27],
  [HIP_R, 26, 28],
];
// Arms carry the pose. Legs count for little so a seated player can still win.
const WEIGHTS = [1.5, 1, 1.5, 1, 0.3, 0.2, 0.3, 0.2];
const ARM_JOINTS = 4;
/** An angle this far off scores zero for that joint. */
export const TOLERANCE = (70 * Math.PI) / 180;
/** Similarity needed to fill the hold ring. */
export const LOCK_AT = 0.72;
export const HOLD_MS = 800;
const VISIBLE = 0.4;

const seen = (p: Point | undefined) => !!p && (p.visibility ?? 1) > VISIBLE;
const signed = (ux: number, uy: number, vx: number, vy: number) =>
  Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/** Fill `out` with the eight signed joint angles (radians) and `has` with
 * whether each could be measured. Every angle is a bend relative to the
 * parent segment (the torso for shoulders and hips), so the result does not
 * change when the body moves, comes closer or leans. Returns how many arm
 * joints were measured. */
export function poseAngles(
  points: Point[] | undefined,
  aspect: number,
  out: Float32Array,
  has: boolean[],
) {
  has.fill(false);
  if (!points) return 0;
  const sl = points[SHOULDER_L],
    sr = points[SHOULDER_R];
  if (!seen(sl) || !seen(sr)) return 0;
  const hl = points[HIP_L],
    hr = points[HIP_R],
    hips = seen(hl) && seen(hr);
  // "Down the torso": shoulders to hips when the hips are in view, otherwise
  // the downward perpendicular of the shoulder line (a player at a desk).
  let tx: number, ty: number;
  if (hips) {
    tx = ((hl.x + hr.x - sl.x - sr.x) / 2) * aspect;
    ty = (hl.y + hr.y - sl.y - sr.y) / 2;
  } else {
    tx = -(sr.y - sl.y);
    ty = (sr.x - sl.x) * aspect;
    if (ty < 0) {
      tx = -tx;
      ty = -ty;
    }
  }
  let arms = 0;
  for (let limb = 0; limb < LIMBS.length; limb++) {
    const root = points[LIMBS[limb][0]],
      mid = points[LIMBS[limb][1]],
      end = points[LIMBS[limb][2]];
    if (!seen(root) || !seen(mid) || (limb > 1 && !hips)) continue;
    const ux = (mid.x - root.x) * aspect,
      uy = mid.y - root.y;
    out[limb * 2] = signed(tx, ty, ux, uy);
    has[limb * 2] = true;
    if (limb < 2) arms++;
    if (!seen(end)) continue;
    out[limb * 2 + 1] = signed(ux, uy, (end.x - mid.x) * aspect, end.y - mid.y);
    has[limb * 2 + 1] = true;
    if (limb < 2) arms++;
  }
  return arms;
}

/** The same pose seen in a mirror: left and right swap and every bend flips. */
export function mirrorAngles(angles: ArrayLike<number>, out: Float32Array) {
  for (let i = 0; i < JOINTS; i += 4) {
    out[i] = -angles[i + 2];
    out[i + 1] = -angles[i + 3];
    out[i + 2] = -angles[i];
    out[i + 3] = -angles[i + 1];
  }
  return out;
}

/** 1 when the two angles agree, falling to 0 at TOLERANCE apart. */
export function jointScore(a: number, b: number) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return Math.max(0, 1 - d / TOLERANCE);
}

/** How alike a measured pose and a target are, 0..1. An arm joint that
 * cannot be seen scores zero (hiding an arm is not a match); a leg joint
 * that cannot be seen is left out. Null when fewer than two arm joints are
 * measured: there is nothing to judge. `scores`, when given, receives the
 * per-joint score (or -1 for a joint that was left out). */
export function similarity(
  angles: ArrayLike<number>,
  has: ArrayLike<boolean>,
  target: ArrayLike<number>,
  scores?: Float32Array,
): number | null {
  let total = 0,
    weight = 0,
    arms = 0;
  for (let i = 0; i < JOINTS; i++) {
    const arm = i < ARM_JOINTS;
    if (scores) scores[i] = -1;
    if (!has[i] && !arm) continue;
    const score = has[i] ? jointScore(angles[i], target[i]) : 0;
    if (has[i] && arm) arms++;
    if (scores) scores[i] = score;
    total += score * WEIGHTS[i];
    weight += WEIGHTS[i];
  }
  return arms < 2 ? null : total / weight;
}

export type Hold = { ms: number; sum: number; frames: number };
export const createHold = (): Hold => ({ ms: 0, sum: 0, frames: 0 });
export function resetHold(hold: Hold) {
  hold.ms = hold.sum = hold.frames = 0;
}
/** Advance the hold-to-lock ring by dt ms. It fills while the pose matches
 * and drains twice as fast when it does not, so a wobble costs a little and
 * a wave through the pose never locks. Returns true once it is locked. */
export function holdStep(hold: Hold, match: number | null, dt: number) {
  if (match !== null && match >= LOCK_AT) {
    hold.ms += dt;
    hold.sum += match;
    hold.frames++;
  } else {
    hold.ms = Math.max(0, hold.ms - dt * 2);
    if (hold.ms === 0) hold.sum = hold.frames = 0;
  }
  return hold.ms >= HOLD_MS;
}
/** 0..1 for the ring. */
export const holdProgress = (hold: Hold) => Math.min(1, hold.ms / HOLD_MS);

/** Points for a locked pose: 100 for a pose at the threshold, up to 200 for
 * a perfect one, plus up to 50 for locking with time to spare. */
export function lockPoints(hold: Hold, timeLeftShare: number) {
  const average = hold.frames ? hold.sum / hold.frames : LOCK_AT,
    quality = Math.min(1, Math.max(0, (average - LOCK_AT) / (1 - LOCK_AT)));
  return Math.round(
    100 + 100 * quality + 50 * Math.min(1, Math.max(0, timeLeftShare)),
  );
}
/** Ms allowed per pose: 8 s early in the round, 5 s at full difficulty. */
export function poseTime(d: number) {
  return 8000 - 3000 * Math.min(1, Math.max(0, d));
}
