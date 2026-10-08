/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Pure maths shared by the GPU effects. No DOM and no GL, so all of it is
 * unit-tested (tests/effects-maths.test.ts). */

export const clamp = (value: number, low = 0, high = 1) =>
  value < low ? low : value > high ? high : value;

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1e-9));
  return t * t * (3 - 2 * t);
}

/** Uniform Catmull-Rom: the curve passes through p1 at t = 0 and p2 at t = 1,
 * with p0 and p3 shaping the tangents. */
export function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
) {
  const t2 = t * t,
    t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

/** Smooth a polyline of `count` points stored as x, y pairs in `points` into
 * `out`, placing `steps` points on every span. The result passes through every
 * input point and ends on the last one. Returns the number of points written
 * (never more than `out` can hold). */
export function smoothPath(
  points: ArrayLike<number>,
  count: number,
  steps: number,
  out: Float32Array,
): number {
  const room = out.length >> 1;
  let written = 0;
  if (count < 1 || room < 1) return 0;
  const at = (i: number, axis: number) =>
    points[2 * clamp(i, 0, count - 1) + axis];
  for (let i = 0; i < count - 1; i++)
    for (let s = 0; s < steps; s++) {
      if (written >= room - 1) break;
      const t = s / steps;
      out[2 * written] = catmullRom(
        at(i - 1, 0),
        at(i, 0),
        at(i + 1, 0),
        at(i + 2, 0),
        t,
      );
      out[2 * written + 1] = catmullRom(
        at(i - 1, 1),
        at(i, 1),
        at(i + 1, 1),
        at(i + 2, 1),
        t,
      );
      written++;
    }
  out[2 * written] = at(count - 1, 0);
  out[2 * written + 1] = at(count - 1, 1);
  return written + 1;
}

/** Deterministic pseudo-random number in [0, 1) from any real input. */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth one-dimensional value noise in [-1, 1]. */
export function noise(x: number, seed = 0) {
  const i = Math.floor(x),
    f = x - i,
    u = f * f * (3 - 2 * f);
  return mix(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u) * 2 - 1;
}

/** Sideways displacement of an energy arc at position t (0..1) along it, in
 * [-1, 1]. It is pinned to zero at both ends, so an arc always starts and ends
 * exactly on the two tracked points, and it crackles as `time` (seconds)
 * advances. */
export function arcOffset(t: number, seed: number, time: number) {
  const envelope = Math.sin(Math.PI * clamp(t)),
    slow = noise(t * 3 + time * 1.7, seed),
    fast = noise(t * 9 - time * 9, seed + 17);
  return envelope * (slow * 0.65 + fast * 0.35);
}

/** Particles per second shed by a joint moving at `speed` (stage heights per
 * second): a resting trickle plus more the faster it moves, capped. */
export function emitRate(
  speed: number,
  rest: number,
  gain: number,
  limit: number,
) {
  return clamp(rest + gain * Math.max(0, speed), 0, limit);
}

/** Chance that one dead particle is reborn in this step so that, across the
 * pool, about `rate * dt` particles are born. `alive` is the estimated number
 * of living particles. */
export function spawnChance(
  rate: number,
  dt: number,
  capacity: number,
  alive: number,
) {
  const dead = Math.max(1, capacity - clamp(alive, 0, capacity));
  return clamp((rate * dt) / dead);
}

/** Next estimate of the living particle count after a step of `dt` seconds:
 * births arrive at `rate`, and lives last `meanLife` seconds on average. */
export function nextAlive(
  alive: number,
  rate: number,
  dt: number,
  meanLife: number,
  capacity: number,
) {
  return clamp(alive + rate * dt - (alive * dt) / meanLife, 0, capacity);
}
