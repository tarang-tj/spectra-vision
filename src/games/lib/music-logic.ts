/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Pure rules of Conductor: hand height to a note of the scale, pinch to
// filter brightness, the drum flick, and the melody to follow.
// No DOM, canvas or audio.
import { difficulty } from "./round";
import type { Rng } from "./round";

/** Rows of the staff. Row 0 is the lowest note, at the bottom of the frame. */
export const LANES = 8;
// A major pentatonic from A3: every row sounds good against every other.
const SCALE = [0, 2, 4, 7, 9],
  ROOT = 57;
// The staff uses this band of the image height; hands rarely reach the edges.
export const STAFF_TOP = 0.14,
  STAFF_BOTTOM = 0.86;
/** How far past a row's edge a hand must travel before the note changes, in
 * rows. Stops a hand resting on a line from flapping between two notes. */
const STICK = 0.18;

/** MIDI note of a row: the scale repeated upward, never a note outside it. */
export function laneMidi(lane: number) {
  const i = Math.min(LANES - 1, Math.max(0, Math.round(lane)));
  return ROOT + 12 * Math.floor(i / SCALE.length) + SCALE[i % SCALE.length];
}
export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** Image y (0..1) of the middle of a row. */
export function laneCentre(lane: number) {
  return STAFF_BOTTOM - ((lane + 0.5) / LANES) * (STAFF_BOTTOM - STAFF_TOP);
}

/** Snap a hand height (image y, 0 at the top) to a row of the staff. Pass
 * the row the hand was on (-1 for none) to get the sticky behaviour. */
export function quantizeLane(y: number, previous = -1) {
  const f = ((STAFF_BOTTOM - y) / (STAFF_BOTTOM - STAFF_TOP)) * LANES,
    lane = Math.min(LANES - 1, Math.max(0, Math.floor(f)));
  if (
    previous >= 0 &&
    lane !== previous &&
    Math.abs(f - (previous + 0.5)) < 0.5 + STICK
  )
    return previous;
  return lane;
}

/** Pinch distance (thumb to index over palm length) to a low-pass cutoff in
 * Hz: a closed pinch is dark, an open hand is bright. */
export function pinchToCutoff(ratio: number) {
  const t = Math.min(1, Math.max(0, (ratio - 0.2) / 0.9));
  return 350 * (6000 / 350) ** (Number.isFinite(t) ? t : 1);
}

export type Flick = { armed: boolean; lastAt: number };
export const createFlick = (): Flick => ({ armed: true, lastAt: -Infinity });
/** Downward speed that counts as a drum hit, in image heights per second. */
export const FLICK_SPEED = 1.5;
const FLICK_COOLDOWN_MS = 160;
/** A faster jump than this is the tracker swapping hands, not a flick. */
const FLICK_MAX_SPEED = 12;

/** Feed one hand's velocity (heights per second, +y is down). Returns true
 * on the result where a fast, mostly vertical, downward flick begins. It
 * fires once per flick: the hand has to slow down before it can fire again. */
export function flickStep(flick: Flick, vx: number, vy: number, time: number) {
  if (!flick.armed) {
    if (vy < FLICK_SPEED * 0.35) flick.armed = true;
    return false;
  }
  if (
    vy >= FLICK_SPEED &&
    vy <= FLICK_MAX_SPEED &&
    vy > Math.abs(vx) * 1.2 &&
    time - flick.lastAt >= FLICK_COOLDOWN_MS
  ) {
    flick.armed = false;
    flick.lastAt = time;
    return true;
  }
  return false;
}

export const PENDING = 0,
  HIT = 1,
  MISSED = 2;
/** One note of the melody: be on row `lane` around `at` ms into the round. */
export type Target = { lane: number; at: number; state: number };
/** A note counts if a hand is on its row within this long of its time. */
export const HIT_WINDOW_MS = 450;
const FIRST_NOTE_MS = 2200;

/** Ms between notes: 1500 early, 850 at full difficulty. */
export function noteGap(d: number) {
  return 1500 - 650 * Math.min(1, Math.max(0, d));
}

/** The melody for one round: a walk up and down the scale that always moves
 * to a different row and never leaps more than two rows. */
export function makeMelody(rng: Rng, roundMs: number): Target[] {
  const targets: Target[] = [];
  let lane = 2 + Math.floor(rng() * 4),
    at = FIRST_NOTE_MS;
  while (at <= roundMs - HIT_WINDOW_MS - 300) {
    targets.push({ lane, at, state: PENDING });
    const step = (rng() < 0.5 ? -1 : 1) * (rng() < 0.65 ? 1 : 2);
    lane += lane + step < 0 || lane + step >= LANES ? -step : step;
    at += noteGap(difficulty(at / roundMs));
  }
  return targets;
}

/** Outcome of resolveTargets, kept by the caller between calls. `cursor` is
 * the first unsettled note and `hitAt` the round time of the latest hit. */
export type Resolved = {
  cursor: number;
  hitAt: number;
  hits: number;
  misses: number;
};
export const createResolved = (): Resolved => ({
  cursor: 0,
  hitAt: -1,
  hits: 0,
  misses: 0,
});

/** Settle every note whose time has come. `laneA` and `laneB` are the rows
 * the two hands are on (-1 for no hand) and `sinceA`, `sinceB` the round
 * time at which each hand arrived on its row. A note is hit only by a hand
 * that arrived after the previous hit, so a hand that never moves cannot
 * collect a second note. */
export function resolveTargets(
  targets: Target[],
  clock: number,
  laneA: number,
  sinceA: number,
  laneB: number,
  sinceB: number,
  out: Resolved,
) {
  out.hits = out.misses = 0;
  for (let i = out.cursor; i < targets.length; i++) {
    const target = targets[i];
    if (target.at - clock > HIT_WINDOW_MS) break;
    if (target.state !== PENDING) continue;
    if (
      (target.lane === laneA && sinceA > out.hitAt) ||
      (target.lane === laneB && sinceB > out.hitAt)
    ) {
      target.state = HIT;
      out.hitAt = clock;
      out.hits++;
    } else if (clock - target.at > HIT_WINDOW_MS) {
      target.state = MISSED;
      out.misses++;
    }
  }
  while (out.cursor < targets.length && targets[out.cursor].state !== PENDING)
    out.cursor++;
  return out;
}
