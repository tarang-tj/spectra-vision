/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TRACKER,
  STEADY_TRACKER,
  Tracker,
} from "../src/vision/tracker";
import type { Detection } from "../src/vision/types";

const det = (x: number, y = 0.3, label = "person", w = 0.1): Detection => ({
  label,
  score: 0.8,
  box: { x, y, w, h: 0.2 },
});
const ids = (t: { id: number }[]) => t.map((x) => x.id);

describe("global matching", () => {
  it("keeps both identities where first-come matching would drop one", () => {
    // d1 sits between the two tracks and is closest to A; d2 can only be A's.
    // Taking the best single pair first (A with d1) would strand B.
    const t = new Tracker(),
      [a, b] = t.update(
        [det(0.4, 0.3, "person", 0.15), det(0.52, 0.3, "person", 0.15)],
        0,
      );
    const next = t.update(
      [det(0.44, 0.3, "person", 0.15), det(0.34, 0.3, "person", 0.15)],
      100,
    );
    expect(next).toHaveLength(2);
    expect(new Set(ids(next))).toEqual(new Set([a.id, b.id]));
  });
});

describe("prediction from velocity", () => {
  it("keeps an id for a fast object through a two frame dropout", () => {
    // Moves 0.05 per 100 ms, then is lost for two frames and has moved 0.15 from where it was last seen, more than a box can reach on its own.
    const t = new Tracker();
    let id = 0;
    for (let i = 0; i < 5; i++)
      id = t.update([det(0.1 + 0.05 * i)], i * 100)[0].id;
    expect(t.update([], 500)).toEqual([]);
    expect(t.update([], 600)).toEqual([]);
    const back = t.update([det(0.1 + 0.05 * 7)], 700);
    expect(ids(back)).toEqual([id]);
  });

  it("separates two objects that cross with the same label", () => {
    const t = new Tracker();
    // One moves right, the other left, and they pass through each other.
    let first: number[] = [];
    for (let i = 0; i <= 7; i++) {
      const out = t.update(
        [
          det(0.15 + 0.1 * i, 0.3, "person", 0.2),
          det(0.85 - 0.1 * i, 0.32, "person", 0.2),
        ],
        i * 66,
      );
      expect(out).toHaveLength(2);
      const byY = [...out].sort((p, q) => p.box.y - q.box.y);
      if (i === 0) first = ids(byY);
      else expect(ids(byY)).toEqual(first);
    }
  });
});

describe("missed frames", () => {
  it("keeps a track through the stated number of misses, then drops it", () => {
    const { maxMisses } = DEFAULT_TRACKER,
      t = new Tracker({ maxAgeMs: 100_000 });
    const id = t.update([det(0.4)], 0)[0].id;
    for (let i = 1; i <= maxMisses; i++) t.update([], i * 50);
    expect(ids(t.update([det(0.4)], (maxMisses + 1) * 50))).toEqual([id]);
    const lost = new Tracker({ maxAgeMs: 100_000 }),
      first = lost.update([det(0.4)], 0)[0].id;
    for (let i = 1; i <= maxMisses + 1; i++) lost.update([], i * 50);
    expect(lost.update([det(0.4)], (maxMisses + 2) * 50)[0].id).not.toBe(first);
  });

  it("never returns a missed track as a detection", () => {
    const t = new Tracker();
    t.update([det(0.4)], 0);
    expect(t.update([], 66)).toEqual([]);
  });
});

describe("confirmation", () => {
  it("gives a one frame flicker no id and does not use up a number", () => {
    const t = new Tracker(STEADY_TRACKER);
    expect(t.update([det(0.4)], 0)).toEqual([]);
    for (const at of [66, 132, 198]) expect(t.update([], at)).toEqual([]);
    // The flicker is forgotten: the next object starts again and takes id 1.
    expect(t.update([det(0.8)], 264)).toEqual([]);
    const out = t.update([det(0.81)], 330);
    expect(ids(out)).toEqual([1]);
    expect(out[0].trail).toHaveLength(2);
  });

  it("confirms an object found on alternate frames at 15 fps", () => {
    const t = new Tracker(STEADY_TRACKER),
      shown: number[][] = [];
    for (let i = 0; i < 40; i++)
      shown.push(ids(t.update(i % 2 ? [] : [det(0.4)], i * 66)));
    // Hidden only on its first sighting, then shown on every frame it is found.
    expect(shown.filter((x) => x.length).length).toBe(19);
    expect(new Set(shown.flat())).toEqual(new Set([1]));
  });

  it("shows a still object from its second result and keeps its id at one result per second", () => {
    for (const gap of [900, 1000, 1500, 3000]) {
      const t = new Tracker(STEADY_TRACKER),
        seen: number[] = [];
      for (let i = 0; i < 12; i++)
        seen.push(...ids(t.update([det(0.4)], i * gap)));
      expect(seen.length, `gap ${gap}`).toBeGreaterThanOrEqual(11);
      expect(new Set(seen).size).toBe(1);
    }
  });

  it("still gives almost no ids to random one-frame flickers at 15 fps", () => {
    const t = new Tracker(STEADY_TRACKER),
      all = new Set<number>();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const d = [det(0.4)];
      if (rnd() < 0.3) d.push(det(rnd() * 0.8, 0.1 + rnd() * 0.5));
      for (const x of t.update(d, i * 66)) all.add(x.id);
    }
    expect(all.size).toBeLessThanOrEqual(5);
  });

  it("keeps an id for a confirmed object that is missed once", () => {
    const t = new Tracker(STEADY_TRACKER);
    t.update([det(0.4)], 0);
    const id = t.update([det(0.4)], 66)[0].id;
    t.update([], 132);
    expect(ids(t.update([det(0.4)], 198))).toEqual([id]);
  });

  it("gives a stable object the same id for a long run", () => {
    const t = new Tracker(STEADY_TRACKER);
    const out = new Set<number>();
    for (let i = 0; i < 200; i++)
      for (const x of t.update([det(0.4 + 0.001 * (i % 3))], i * 66))
        out.add(x.id);
    expect(out.size).toBe(1);
  });
});
