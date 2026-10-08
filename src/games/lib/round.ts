/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Pure round bookkeeping shared by every game: the 3-2-1 start, the round
// clock, the combo multiplier and the difficulty ramp. No DOM, canvas or audio.

export type Phase = "countdown" | "playing" | "result";
/** What `advance` reports so the caller can play a sound or reset the game. */
export type RoundEvent = "tick" | "go" | "end" | null;

export type Round = {
  phase: Phase;
  /** Ms spent in the current phase. Driven only by the stage's frame time. */
  clock: number;
  roundMs: number;
  countdownMs: number;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
};

export const ROUND_MS = 50_000;
export const COUNTDOWN_MS = 3_000;
/** A frame gap longer than this (a hidden tab, a stall) counts as this much,
 * so a round never jumps ahead while nobody could play. */
export const MAX_STEP_MS = 100;
const COMBO_STEP = 5;
const MAX_MULTIPLIER = 5;

export function createRound(
  roundMs = ROUND_MS,
  countdownMs = COUNTDOWN_MS,
): Round {
  return {
    phase: "countdown",
    clock: 0,
    roundMs,
    countdownMs,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    misses: 0,
  };
}

/** Start the same round object again (Play again) without allocating. */
export function restart(round: Round) {
  round.phase = "countdown";
  round.clock = 0;
  round.score = 0;
  round.combo = 0;
  round.bestCombo = 0;
  round.hits = 0;
  round.misses = 0;
}

/** The number shown during the start: 3, 2, 1. Zero once play has begun. */
export function countdownNumber(round: Round) {
  if (round.phase !== "countdown") return 0;
  return Math.max(1, Math.ceil((round.countdownMs - round.clock) / 1000));
}

/** Move the round clock on by one frame. Returns what just happened. */
export function advance(round: Round, dt: number): RoundEvent {
  if (round.phase === "result" || !(dt > 0)) return null;
  const step = Math.min(dt, MAX_STEP_MS);
  if (round.phase === "countdown") {
    const before = countdownNumber(round);
    round.clock += step;
    if (round.clock >= round.countdownMs) {
      round.phase = "playing";
      round.clock = 0;
      return "go";
    }
    return countdownNumber(round) !== before ? "tick" : null;
  }
  round.clock += step;
  if (round.clock >= round.roundMs) {
    round.clock = round.roundMs;
    round.phase = "result";
    return "end";
  }
  return null;
}

/** x1 for the first five hits in a row, then one more per five, up to x5. */
export function multiplier(combo: number) {
  return Math.min(
    MAX_MULTIPLIER,
    1 + Math.floor(Math.max(0, combo) / COMBO_STEP),
  );
}

/** Count a hit worth `base` points before the multiplier. Returns the points
 * actually added. Ignored outside play so a late frame cannot score. */
export function hit(round: Round, base: number) {
  if (round.phase !== "playing") return 0;
  const points = Math.round(base) * multiplier(round.combo);
  round.combo++;
  round.hits++;
  if (round.combo > round.bestCombo) round.bestCombo = round.combo;
  round.score += points;
  return points;
}

/** Points that neither build nor need a combo (a drum flick). */
export function bonus(round: Round, points: number) {
  if (round.phase !== "playing") return 0;
  round.score += Math.round(points);
  return Math.round(points);
}

export function miss(round: Round) {
  if (round.phase !== "playing") return;
  round.combo = 0;
  round.misses++;
}

/** 0 at the start of play, 1 at the end. */
export function progress(round: Round) {
  if (round.phase === "countdown") return 0;
  return Math.min(1, round.clock / round.roundMs);
}

/** Difficulty 0..1: gentle for the first seconds, then a smooth ramp that
 * reaches full difficulty at 85% of the round. */
export function difficulty(p: number) {
  const t = Math.min(1, Math.max(0, p) / 0.85);
  return t * t * (3 - 2 * t);
}

/** Whole seconds left on the round clock, rounded up. */
export function secondsLeft(round: Round) {
  if (round.phase === "result") return 0;
  if (round.phase === "countdown") return Math.ceil(round.roundMs / 1000);
  return Math.ceil((round.roundMs - round.clock) / 1000);
}

/** Share of resolved targets that were hit, 0..1. Null before any resolved. */
export function accuracy(round: Round) {
  const total = round.hits + round.misses;
  return total ? round.hits / total : null;
}

/** Small deterministic generator so spawns and melodies can be unit-tested. */
export function createRng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof createRng>;
