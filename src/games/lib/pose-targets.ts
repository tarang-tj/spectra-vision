/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// The poses Mirror asks for, as joint angles. Pure data and selection.
import { JOINTS, mirrorAngles } from "./pose-logic";
import type { Rng } from "./round";

export type PoseTarget = {
  name: string;
  angles: Float32Array;
  /** The same pose mirrored, precomputed so matching allocates nothing. */
  mirrored: Float32Array;
};

// Degrees, in joint order: left shoulder, left elbow, right shoulder, right
// elbow, left hip, left knee, right hip, right knee. Zero is "hanging
// straight down" for a shoulder or hip and "straight" for an elbow or knee.
// The person faces the viewer: a negative shoulder angle lifts the left arm
// toward the viewer's right.
const POSES: [string, number[]][] = [
  ["T pose", [-90, 0, 90, 0, 0, 0, 0, 0]],
  ["Big Y", [-140, 0, 140, 0, 0, 0, 0, 0]],
  ["Goalpost", [-90, -90, 90, 90, 0, 0, 0, 0]],
  ["Hands on hips", [-45, 80, 45, -80, 0, 0, 0, 0]],
  ["Disco", [-140, 0, 45, 0, 0, 0, 0, 0]],
  ["Flex", [-90, -125, 90, 125, 0, 0, 0, 0]],
  ["Star", [-115, 0, 115, 0, -25, 0, 25, 0]],
  ["Touchdown", [-170, 0, 170, 0, 0, 0, 0, 0]],
  ["Zigzag", [-90, -90, 90, -90, 0, 0, 0, 0]],
  ["Salute", [-90, -135, 15, 0, 0, 0, 0, 0]],
];

export const TARGETS: readonly PoseTarget[] = POSES.map(([name, degrees]) => {
  const angles = Float32Array.from(degrees, (d) => (d * Math.PI) / 180);
  return {
    name,
    angles,
    mirrored: mirrorAngles(angles, new Float32Array(JOINTS)),
  };
});

/** Index of the next pose: random, but never the one just shown. */
export function nextTarget(rng: Rng, previous: number) {
  const pick = Math.floor(rng() * (TARGETS.length - 1));
  return previous >= 0 && pick >= previous ? pick + 1 : pick;
}
