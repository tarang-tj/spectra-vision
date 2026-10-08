/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Pure rules of Slice: orb flight and the stroke-against-orb hit test (the
// fingertip strokes themselves are followed in blade-logic.ts).
// No DOM, canvas or audio. Positions use "play space": x runs 0..aspect and
// y runs 0..1 (both in units of the image height), so a circle is a circle.
import type { Rng } from "./round";

export type Orb = {
  alive: boolean;
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  tint: number;
};
export type SliceState = {
  orbs: Orb[];
  spawnIn: number;
  nextId: number;
};

export const MAX_ORBS = 10;
/** The hit box is this much larger than the drawn orb: generous on purpose. */
export const HIT_SCALE = 1.45;
const GRAVITY = 1.6;

export function createSlice(): SliceState {
  return {
    orbs: Array.from({ length: MAX_ORBS }, () => ({
      alive: false,
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0,
      tint: 0,
    })),
    spawnIn: 400,
    nextId: 1,
  };
}

export function resetSlice(state: SliceState) {
  for (const orb of state.orbs) orb.alive = false;
  state.spawnIn = 400;
  state.nextId = 1;
}

/** True when the segment a-b passes within `r` of the centre c. This is what
 * catches a fast stroke whose two samples both lie outside the orb. */
export function segmentHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
) {
  const dx = bx - ax,
    dy = by - ay,
    lengthSq = dx * dx + dy * dy;
  // Closest point of the segment to the centre, clamped to its two ends.
  let t = lengthSq > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / lengthSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nx = ax + dx * t - cx,
    ny = ay + dy * t - cy;
  return nx * nx + ny * ny <= r * r;
}

/** Ms between spawns: 1100 at the start of a round, 460 at full difficulty. */
export function spawnInterval(d: number) {
  return 1100 - 640 * Math.min(1, Math.max(0, d));
}
/** How much faster orbs fly at difficulty d: 1x up to 1.45x. */
export function flightSpeed(d: number) {
  return 1 + 0.45 * Math.min(1, Math.max(0, d));
}

function spawn(state: SliceState, rng: Rng, aspect: number) {
  const orb = state.orbs.find((o) => !o.alive);
  if (!orb) return;
  orb.alive = true;
  orb.id = state.nextId++;
  orb.r = 0.055 + rng() * 0.02;
  orb.x = aspect * (0.15 + rng() * 0.7);
  orb.y = 1 + orb.r;
  // Thrown up from below the frame and drifting toward the middle, so every
  // orb peaks inside the picture before it falls back.
  orb.vx = (aspect / 2 - orb.x) * (0.15 + rng() * 0.35);
  orb.vy = -(1.3 + rng() * 0.3);
  orb.tint = Math.floor(rng() * 4);
}

/** Fly the orbs for dt ms and spawn new ones. Returns how many fell out of
 * the frame without being sliced (each one is a miss); `lost` is told which. */
export function stepSlice(
  state: SliceState,
  dtMs: number,
  d: number,
  rng: Rng,
  aspect: number,
  lost?: (orb: Orb) => void,
) {
  const dt = (dtMs / 1000) * flightSpeed(d);
  let missed = 0;
  for (let i = 0; i < state.orbs.length; i++) {
    const orb = state.orbs[i];
    if (!orb.alive) continue;
    orb.vy += GRAVITY * dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    if (orb.vy > 0 && orb.y > 1 + orb.r + 0.02) {
      orb.alive = false;
      missed++;
      lost?.(orb);
    }
  }
  state.spawnIn -= dtMs;
  if (state.spawnIn <= 0) {
    spawn(state, rng, aspect);
    // Late in the round an orb sometimes brings a partner.
    if (d > 0.5 && rng() < d * 0.45) spawn(state, rng, aspect);
    state.spawnIn += spawnInterval(d);
  }
  return missed;
}

/** Slice every orb the stroke a-b passes through. Returns how many; `cut`
 * is told which, for the caller's feedback. */
export function sliceStroke(
  state: SliceState,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cut?: (orb: Orb) => void,
) {
  let hits = 0;
  for (let i = 0; i < state.orbs.length; i++) {
    const orb = state.orbs[i];
    if (!orb.alive) continue;
    if (!segmentHitsCircle(ax, ay, bx, by, orb.x, orb.y, orb.r * HIT_SCALE))
      continue;
    orb.alive = false;
    hits++;
    cut?.(orb);
  }
  return hits;
}
