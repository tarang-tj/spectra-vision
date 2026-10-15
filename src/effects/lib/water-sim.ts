/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Rect } from "../../vision/frame";
import type { HandSample } from "./water-hand";

/** The water blob's life: summoned by an open palm, held, thrown, splashed.
 * Pure code with no GL, so every transition is unit-tested. Positions are
 * stage CSS pixels and come only from hand landmarks; the random spread of
 * the droplets is decoration. Nothing here allocates per frame. */
export type WaterPhase = "idle" | "held" | "flying" | "splash";
export type WaterState = {
  phase: WaterPhase;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Size of a held blob, 0 to 1 over GROW_S. */
  grow: number;
  /** Idle: seconds the palm has been open, or the cooldown left when < 0.
   * Held: seconds without a hand. */
  timer: number;
  hx: number;
  hy: number;
  /** Time of the last palm sample in ms, or -1 when there is none. */
  ht: number;
  hvx: number;
  hvy: number;
  /** MAX_DROPS rows of x, y, vx, vy, life. */
  drops: Float32Array;
  dropCount: number;
  /** Most drops one splash may use. */
  limit: number;
  /** age < 0 means no puddle. */
  puddle: { x: number; y: number; w: number; age: number };
};

export const SUMMON_S = 0.25,
  GROW_S = 0.3,
  RADIUS = 0.6,
  THROW = 7,
  KEEP = 1.15,
  GRAVITY = 2.4,
  MAX_DROPS = 16,
  DROP_LIFE = 0.7,
  PUDDLE_S = 1.4,
  COOLDOWN = 0.4,
  /** A held blob waits this long for a hand the model missed before it falls. */
  GRACE_S = 0.2;

export function createWater(limit = MAX_DROPS): WaterState {
  const s = { phase: "idle", drops: new Float32Array(MAX_DROPS * 5) };
  return resetWater(s as WaterState, limit);
}

/** Back to idle with no drops, no puddle and no cooldown. */
export function resetWater(s: WaterState, limit = s.limit): WaterState {
  Object.assign(s, { phase: "idle", x: 0, y: 0, vx: 0, vy: 0, r: 0 });
  Object.assign(s, { grow: 0, timer: 0, hx: 0, hy: 0, ht: -1, hvx: 0 });
  Object.assign(s, { hvy: 0, dropCount: 0, limit: Math.min(limit, MAX_DROPS) });
  s.puddle = { x: 0, y: 0, w: 0, age: -1 };
  return s;
}

/** Burst the blob into drops at its position. `up` bounces them off a floor. */
function splash(s: WaterState, up: boolean, random: () => number) {
  s.phase = "splash";
  const d = s.drops,
    n = Math.min(s.limit, MAX_DROPS);
  for (let i = s.dropCount; i < n; i++, s.dropCount++) {
    const a = random() * Math.PI * 2,
      kick = s.r * (3 + random() * 7);
    d[i * 5] = s.x + Math.cos(a) * s.r * 0.4;
    d[i * 5 + 1] = s.y + Math.sin(a) * s.r * 0.4;
    d[i * 5 + 2] = s.vx * 0.3 + Math.cos(a) * kick;
    d[i * 5 + 3] = up
      ? -Math.abs(s.vy) * 0.3 - (0.4 + random()) * s.r * 8
      : s.vy * 0.3 + Math.sin(a) * kick;
    d[i * 5 + 4] = DROP_LIFE * (0.6 + 0.4 * random());
  }
}

/** Snap a held blob onto the palm at full size. */
function hold(s: WaterState, hand: HandSample) {
  s.x = hand.x;
  s.y = hand.y;
  s.r = RADIUS * hand.size;
}

/** Advance the simulation by `dt` seconds of animation. `live` is the time
 * that passed for the user's own motion: under reduced motion `dt` is 0 but
 * `live` runs, so an open palm still gathers a still ball of water that
 * follows the hand, and nothing is thrown or splashes. Paused, both are 0. */
export function stepWater(
  s: WaterState,
  hand: HandSample | null,
  rect: Rect,
  dt: number,
  random: () => number,
  live = dt,
): void {
  if (dt <= 0) {
    if (s.phase === "held" && hand) {
      hold(s, hand);
      // Reduced motion shows the ball whole; a pause keeps it as it was.
      if (live > 0) s.grow = 1;
      s.timer = 0;
    } else if (s.phase === "held" && live > 0) {
      // Reduced motion: a lost hand lets go of the ball, it does not fall.
      s.timer += live;
      if (s.timer >= GRACE_S - 1e-9) s.phase = "idle";
      if (s.phase === "idle") s.timer = s.grow = 0;
    } else if (s.phase === "idle" && live > 0 && hand?.open) {
      s.timer = Math.max(0, s.timer) + live;
      if (s.timer >= SUMMON_S - 1e-9) {
        s.phase = "held";
        s.timer = 0;
        s.grow = 1;
        hold(s, hand);
      }
    } else if (s.phase === "idle" && live > 0) s.timer = 0;
    return;
  }
  // Palm velocity: only a new model result moves it, smoothed (EMA 0.5).
  if (!hand) s.ht = -1;
  else if (hand.t !== s.ht) {
    const gap = (hand.t - s.ht) / 1000;
    if (s.ht < 0 || gap <= 0 || gap > 0.25) s.hvx = s.hvy = 0;
    else {
      s.hvx = 0.5 * s.hvx + (0.5 * (hand.x - s.hx)) / gap;
      s.hvy = 0.5 * s.hvy + (0.5 * (hand.y - s.hy)) / gap;
    }
    s.hx = hand.x;
    s.hy = hand.y;
    s.ht = hand.t;
  }
  const g = GRAVITY * rect.h,
    floor = rect.y + rect.h;
  if (s.phase === "idle") {
    if (s.timer < 0) s.timer = Math.min(0, s.timer + dt);
    else if (hand?.open) {
      s.timer += dt;
      if (s.timer >= SUMMON_S - 1e-9) {
        s.phase = "held";
        s.grow = s.timer = 0;
        hold(s, hand);
      }
    } else s.timer = 0;
  } else if (s.phase === "held") {
    if (!hand) {
      s.timer += dt;
      if (s.timer >= GRACE_S - 1e-9) {
        s.phase = "flying";
        s.vx = s.hvx;
        s.vy = s.hvy;
      }
    } else if (!hand.open) {
      s.vx = s.vy = 0;
      splash(s, false, random);
    } else if (Math.hypot(s.hvx, s.hvy) > THROW * hand.size) {
      s.phase = "flying";
      s.vx = s.hvx * KEEP;
      s.vy = s.hvy * KEEP;
    } else {
      hold(s, hand);
      s.timer = 0;
      s.grow = Math.min(1, s.grow + dt / GROW_S);
    }
  } else if (s.phase === "flying") {
    s.vy += g * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.y + s.r >= floor) {
      s.y = floor - s.r * 0.5;
      const p = s.puddle;
      p.x = s.x;
      p.y = floor;
      p.w = s.r * 1.6;
      p.age = 0;
      splash(s, true, random);
    } else if (Math.abs(s.x - rect.x - rect.w / 2) > rect.w / 2 + s.r)
      splash(s, false, random);
    else if (s.y < rect.y - s.r) splash(s, false, random);
  } else {
    const d = s.drops;
    for (let i = 0; i < s.dropCount; i++) {
      const o = i * 5;
      d[o + 3] += g * dt;
      d[o] += d[o + 2] * dt;
      d[o + 1] += d[o + 3] * dt;
      d[o + 4] -= dt;
      if (d[o + 4] > 0 && d[o + 1] < floor + s.r) continue;
      // Remove by moving the last drop into this slot.
      s.dropCount--;
      d.copyWithin(o, s.dropCount * 5, s.dropCount * 5 + 5);
      i--;
    }
    const p = s.puddle;
    if (p.age >= 0) p.age = p.age + dt >= PUDDLE_S ? -1 : p.age + dt;
    if (!s.dropCount && p.age < 0) {
      s.phase = "idle";
      s.timer = -COOLDOWN;
      s.grow = 0;
    }
  }
}
