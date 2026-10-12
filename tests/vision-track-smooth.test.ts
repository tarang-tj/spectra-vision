/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { TrackSmoother } from "../src/vision/track-smooth";
import type { Track } from "../src/vision/types";
import { lcgNormal } from "./helpers/seeded";

const W = 1280,
  H = 720,
  GAP = 1000 / 15;
const track = (cx: number, cy: number, id = 1, w = 0.1, h = 0.2): Track => ({
  id,
  label: "chair",
  score: 0.8,
  box: { x: cx - w / 2, y: cy - h / 2, w, h },
  lastSeen: 0,
  trail: [],
});
const centre = (t: Track) => ({
  x: t.box.x + t.box.w / 2,
  y: t.box.y + t.box.h / 2,
});
const meanStep = (points: { x: number; y: number }[]) => {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(
      (points[i].x - points[i - 1].x) * W,
      (points[i].y - points[i - 1].y) * H,
    );
  return sum / (points.length - 1);
};

describe("TrackSmoother", () => {
  it("more than halves the movement of a still box with 2 px of noise at 15 Hz", () => {
    const noise = lcgNormal(7),
      smoother = new TrackSmoother(),
      raw: { x: number; y: number }[] = [],
      drawn: { x: number; y: number }[] = [];
    for (let i = 0; i < 120; i++) {
      const t = track(0.5 + (2 * noise()) / W, 0.5 + (2 * noise()) / H);
      raw.push(centre(t));
      drawn.push(centre(smoother.apply([t], i * GAP)[0]));
    }
    // After ten results, as the replay on recorded results is read.
    const before = meanStep(raw.slice(10)),
      after = meanStep(drawn.slice(10));
    expect(before).toBeGreaterThan(2);
    expect(after).toBeLessThan(before / 2);
  });
  it("follows a box that crosses half the frame in a second", () => {
    const smoother = new TrackSmoother();
    let worst = 0;
    for (let i = 0; i <= 15; i++) {
      const t = track(0.25 + (0.5 * i) / 15, 0.5),
        out = smoother.apply([t], i * GAP)[0];
      if (i >= 5)
        worst = Math.max(worst, Math.abs(centre(out).x - centre(t).x));
    }
    expect(worst).toBeLessThan(0.02);
  });
  it("steadies the size as well as the place", () => {
    const noise = lcgNormal(11),
      smoother = new TrackSmoother(),
      raw: number[] = [],
      drawn: number[] = [];
    for (let i = 0; i < 120; i++) {
      const t = track(0.5, 0.5, 1, 0.1 + (3 * noise()) / W);
      raw.push(t.box.w * W);
      drawn.push(smoother.apply([t], i * GAP)[0].box.w * W);
    }
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(drawn.slice(10))).toBeLessThan(spread(raw.slice(10)) / 2);
  });
  it("changes nothing it is given and keeps order, ids and every other field", () => {
    const smoother = new TrackSmoother(),
      first = [track(0.3, 0.3, 1), track(0.7, 0.6, 2)],
      next = [track(0.31, 0.3, 2), { ...track(0.7, 0.61, 1), held: true }],
      copy = JSON.parse(JSON.stringify(next));
    smoother.apply(first, 0);
    const out = smoother.apply(next as Track[], GAP);
    expect(next).toEqual(copy);
    expect(out.map((t) => t.id)).toEqual([2, 1]);
    expect(out[1]).toMatchObject({ label: "chair", score: 0.8, held: true });
    expect(out[0].box).not.toEqual(next[0].box);
    // Each id has its own filter: id 2 came from (0.7, 0.6), not (0.3, 0.3).
    expect(centre(out[0]).x).toBeGreaterThan(0.31);
  });
  it("passes the first sighting of a track through unchanged", () => {
    const smoother = new TrackSmoother(),
      t = track(0.42, 0.37);
    expect(smoother.apply([t], 500)[0].box).toEqual(t.box);
  });
  it("forgets a track that is gone, and everything on reset", () => {
    const smoother = new TrackSmoother();
    smoother.apply([track(0.2, 0.2)], 0);
    smoother.apply([], GAP);
    // The id is back somewhere else: it starts there, with no glide.
    const back = track(0.8, 0.8);
    expect(smoother.apply([back], 2 * GAP)[0].box).toEqual(back.box);
    smoother.reset();
    const again = track(0.1, 0.1);
    expect(smoother.apply([again], 3 * GAP)[0].box).toEqual(again.box);
  });
});
