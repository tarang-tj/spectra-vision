/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Point } from "../../vision/types";

// Pure geometry for joining the separate models' outputs into one figure.
// No DOM and no canvas, so it is unit-tested.

export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
const LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12;
/** Pose landmarks below this visibility are treated as not seen (as in Body). */
export const VISIBLE = 0.4;
export const seen = (p: Point | undefined): p is Point =>
  !!p && (p.visibility ?? 1) > VISIBLE;

// Pose landmarks the other models describe better: the face (0..10) and the
// three finger stubs past each wrist.
export const POSE_FACE_POINTS = 11;
export const POSE_HAND_POINTS: Record<number, number[]> = {
  [LEFT_WRIST]: [17, 19, 21],
  [RIGHT_WRIST]: [18, 20, 22],
};

/** For every hand, the pose wrist (15 or 16) it belongs to, or null when no
 * visible wrist of the body is close enough. A hand's wrist (its landmark 0)
 * must lie within half a shoulder width of the pose wrist; each pose wrist
 * takes at most one hand, the nearest. `aspect` is source width / height. */
export function attachHands(
  pose: Point[] | undefined,
  hands: Point[][],
  aspect: number,
): (number | null)[] {
  const attached: (number | null)[] = hands.map(() => null);
  if (!pose) return attached;
  const distance = (a: Point, b: Point) =>
    Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const left = pose[LEFT_SHOULDER],
    right = pose[RIGHT_SHOULDER],
    reach = Math.max(
      0.04,
      seen(left) && seen(right) ? distance(left, right) / 2 : 0,
    );
  const pairs: { hand: number; wrist: number; gap: number }[] = [];
  hands.forEach((points, hand) => {
    const root = points[0];
    if (!root) return;
    for (const wrist of [LEFT_WRIST, RIGHT_WRIST]) {
      const joint = pose[wrist];
      if (!seen(joint)) continue;
      const gap = distance(root, joint);
      if (gap <= reach) pairs.push({ hand, wrist, gap });
    }
  });
  const taken = new Set<number>();
  pairs
    .sort((a, b) => a.gap - b.gap)
    .forEach(({ hand, wrist }) => {
      if (attached[hand] !== null || taken.has(wrist)) return;
      attached[hand] = wrist;
      taken.add(wrist);
    });
  return attached;
}
