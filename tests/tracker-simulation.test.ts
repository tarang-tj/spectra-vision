/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { STEADY_TRACKER, Tracker } from "../src/vision/tracker";
import type { Detection } from "../src/vision/types";

// Seeded simulation: the only way to put a number on how often the tracker
// hides a sparse object or swaps two ids. Every run is reproducible.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const det = (x: number, y: number, w: number, h: number): Detection => ({
  label: "person",
  score: 0.8,
  box: { x, y, w, h },
});

/** An object seen on every `every`-th frame at `fps`; returns how many of its
 * sightings come back with an id, and how many sightings there were. */
function sparse(every: number, fps = 15, frames = 150) {
  const t = new Tracker(STEADY_TRACKER),
    ids = new Set<number>();
  let seen = 0,
    shown = 0;
  for (let i = 0; i < frames; i++) {
    const hit = i % every === 0,
      out = t.update(hit ? [det(0.4, 0.3, 0.2, 0.3)] : [], (i * 1000) / fps);
    if (hit) seen++;
    for (const x of out) {
      ids.add(x.id);
      shown++;
    }
  }
  return { seen, shown, ids: ids.size };
}

/** Two same-size boxes crossing head-on, `speed` frame widths per second
 * each, with box noise of standard deviation `jitter`; the start phase within
 * a frame is random. "swap": the last result showing both ids has them
 * exchanged. "lost": that result holds an id the pair did not start with. */
function crossing(speed: number, fps: number, jitter: number, seed: number) {
  const r = rng(seed),
    half = 0.3,
    phase = r(),
    frames = Math.ceil(((2 * half) / speed) * fps) + 1,
    t = new Tracker({ ...STEADY_TRACKER }),
    first: number[] = [];
  let last: number[] = [];
  for (let i = 0; i < frames; i++) {
    const dx = Math.min(2 * half, ((i + phase) / fps) * speed),
      noisy = (x: number) =>
        det(
          x + jitter * gauss(r),
          0.3 + jitter * gauss(r),
          0.2 + jitter * gauss(r) * 0.5,
          0.3 + jitter * gauss(r) * 0.5,
        ),
      out = t.update(
        [noisy(0.4 - half + dx - 0.1), noisy(0.4 + half - dx - 0.1)],
        (i * 1000) / fps,
      );
    if (out.length === 2) {
      last = out.map((x) => x.id);
      if (!first.length) first.push(...last);
    }
  }
  if (!first.length) return "lost";
  if (last[0] === first[0] && last[1] === first[1]) return "ok";
  return last.every((id) => first.includes(id)) ? "swap" : "lost";
}
function rates(speed: number, fps: number, jitter: number, runs = 400) {
  const n = { ok: 0, swap: 0, lost: 0 };
  for (let s = 1; s <= runs; s++) n[crossing(speed, fps, jitter, s)]++;
  return n;
}

/** Ids handed out over 300 frames of a steady object plus a 30% chance per
 * frame of a one-frame detection somewhere else at random. */
function flickerIds(seed: number) {
  const r = rng(seed),
    t = new Tracker(STEADY_TRACKER),
    all = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const d = [det(0.4, 0.2, 0.15, 0.4)];
    if (r() < 0.3) d.push(det(r() * 0.8, 0.1 + r() * 0.5, 0.15, 0.4));
    for (const x of t.update(d, i * 66)) all.add(x.id);
  }
  return all.size;
}

// Thresholds sit just above what the seeded runs give now. Before the change
// (same seeds): flicker ids mean 10.55 (now about 10.8, a deliberate cost of the window); sparse every 4th/5th frame shown 0/38
// and 0/30; swaps of 400 runs 34, 83, 104 and, at 2 fps, 64 swaps plus 219
// runs where an id was lost.
describe("flicker (simulation)", () => {
  it("gives random one-frame detections no more ids than before", () => {
    const counts = Array.from({ length: 40 }, (_, k) => flickerIds(k + 1)),
      mean = counts.reduce((a, b) => a + b) / counts.length;
    console.log(`flicker ids: mean ${mean} max ${Math.max(...counts)}`);
    expect(mean).toBeLessThanOrEqual(11);
  });
});

describe("sparse detections (simulation)", () => {
  it.each([
    [2, 73],
    [3, 48],
    [4, 36],
    [5, 28],
  ])(
    "shows an object found every %ith frame in %i+ sightings",
    (every, min) => {
      const r = sparse(every);
      console.log(`sparse every ${every}: shown ${r.shown}/${r.seen}`);
      expect(r.shown).toBeGreaterThanOrEqual(min);
      expect(r.ids).toBe(1);
    },
  );
});

describe("crossings (simulation)", () => {
  it.each([
    [0.3, 15, 0.01, 5, 5],
    [0.3, 15, 0.02, 10, 20],
    [0.1, 15, 0.01, 20, 8],
    [0.3, 2, 0.005, 10, 8],
    [0.2, 2, 0.005, 2, 8],
  ])(
    "swaps ids at speed %f, %i fps, jitter %f in at most %i of 400 runs (id lost at most %i)",
    (speed, fps, jitter, most, lostMost) => {
      const n = rates(speed, fps, jitter);
      console.log(
        `swap speed ${speed} fps ${fps} jitter ${jitter}: swap ${n.swap} lost ${n.lost} /400`,
      );
      expect(n.swap).toBeLessThanOrEqual(most);
      expect(n.lost).toBeLessThanOrEqual(lostMost);
    },
  );
});
