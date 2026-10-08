/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import * as blades from "../src/games/lib/blade-logic";
import * as round from "../src/games/lib/round";
import * as slice from "../src/games/lib/slice-logic";

describe("round clock, combo and difficulty", () => {
  it("counts 3, 2, 1, plays for the round length, then ends once", () => {
    const r = round.createRound(50_000, 3_000),
      events: string[] = [];
    expect(round.countdownNumber(r)).toBe(3);
    let elapsed = 0;
    while (r.phase !== "result" && elapsed < 120_000) {
      const event = round.advance(r, 33);
      if (event) events.push(event);
      elapsed += 33;
    }
    expect(events).toEqual(["tick", "tick", "go", "end"]);
    // 3 s of countdown plus 50 s of play, within one frame of rounding each.
    expect(elapsed).toBeGreaterThanOrEqual(53_000);
    expect(elapsed).toBeLessThan(53_100);
    expect(round.secondsLeft(r)).toBe(0);
    expect(round.advance(r, 33)).toBeNull();
  });
  it("does not move while paused (dt 0) and caps a long frame gap", () => {
    const r = round.createRound(50_000, 3_000);
    expect(round.advance(r, 0)).toBeNull();
    expect(r.clock).toBe(0);
    round.advance(r, 60_000);
    expect(r.phase).toBe("countdown");
    expect(r.clock).toBe(round.MAX_STEP_MS);
  });
  it("scores only during play, multiplies by the combo and resets on a miss", () => {
    const r = round.createRound(1_000, 100);
    expect(round.hit(r, 10)).toBe(0);
    round.advance(r, 100);
    expect(r.phase).toBe("playing");
    const points = Array.from({ length: 12 }, () => round.hit(r, 10));
    expect(points).toEqual([10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 30, 30]);
    expect(r.combo).toBe(12);
    round.miss(r);
    expect([r.combo, r.bestCombo, r.misses, r.hits]).toEqual([0, 12, 1, 12]);
    expect(round.hit(r, 10)).toBe(10);
    expect(round.accuracy(r)).toBeCloseTo(13 / 14);
    expect(round.multiplier(1000)).toBe(5);
    for (let i = 0; i < 20; i++) round.advance(r, 100);
    expect(r.phase).toBe("result");
    const final = r.score;
    expect(round.hit(r, 10)).toBe(0);
    expect(round.bonus(r, 25)).toBe(0);
    expect(r.score).toBe(final);
  });
  it("ramps difficulty smoothly from 0 to 1 and never backwards", () => {
    expect(round.difficulty(0)).toBe(0);
    expect(round.difficulty(0.85)).toBe(1);
    expect(round.difficulty(1)).toBe(1);
    let previous = -1;
    for (let p = 0; p <= 1; p += 0.05) {
      const d = round.difficulty(p);
      expect(d).toBeGreaterThanOrEqual(previous);
      previous = d;
    }
    expect(slice.spawnInterval(0)).toBe(1100);
    expect(slice.spawnInterval(1)).toBe(460);
    expect(slice.flightSpeed(1)).toBeGreaterThan(slice.flightSpeed(0));
  });
});

describe("fingertip stroke against an orb", () => {
  it("hits when the stroke passes through, even if both samples are outside", () => {
    // A fast stroke that skipped frames: the orb sits between the two samples.
    expect(slice.segmentHitsCircle(0.1, 0.5, 0.9, 0.5, 0.5, 0.5, 0.06)).toBe(
      true,
    );
    expect(slice.segmentHitsCircle(0.1, 0.1, 0.9, 0.9, 0.5, 0.52, 0.06)).toBe(
      true,
    );
  });
  it("misses when the stroke passes beside, stops short or starts beyond", () => {
    expect(slice.segmentHitsCircle(0.1, 0.5, 0.9, 0.5, 0.5, 0.7, 0.06)).toBe(
      false,
    );
    expect(slice.segmentHitsCircle(0.1, 0.5, 0.3, 0.5, 0.5, 0.5, 0.06)).toBe(
      false,
    );
    expect(slice.segmentHitsCircle(0.7, 0.5, 0.9, 0.5, 0.5, 0.5, 0.06)).toBe(
      false,
    );
  });
  it("treats a zero-length stroke as a point test", () => {
    expect(slice.segmentHitsCircle(0.5, 0.5, 0.5, 0.5, 0.52, 0.5, 0.06)).toBe(
      true,
    );
    expect(slice.segmentHitsCircle(0.5, 0.5, 0.5, 0.5, 0.7, 0.5, 0.06)).toBe(
      false,
    );
  });
  it("needs speed: a slow drift, a stale gap and a teleport are not slices", () => {
    expect(blades.isSlice(0.3, 100)).toBe(true);
    expect(blades.isSlice(0.02, 100)).toBe(false);
    expect(blades.isSlice(0.3, 0)).toBe(false);
    expect(blades.isSlice(0.6, blades.MAX_GAP_MS + 1)).toBe(false);
    expect(blades.isSlice(blades.MAX_JUMP + 0.1, 50)).toBe(false);
  });
});

describe("orbs and blades", () => {
  it("throws orbs up into the frame, then counts each unsliced one as a miss", () => {
    const state = slice.createSlice(),
      rng = round.createRng(7),
      lost: number[] = [];
    let top = 2,
      missed = 0,
      spawned = 0;
    for (let t = 0; t < 6000; t += 33) {
      missed += slice.stepSlice(state, 33, 0, rng, 1.6, (orb) =>
        lost.push(orb.id),
      );
      for (const orb of state.orbs) if (orb.alive) top = Math.min(top, orb.y);
      spawned = state.nextId - 1;
    }
    expect(spawned).toBeGreaterThanOrEqual(5);
    expect(top).toBeLessThan(0.6);
    expect(top).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
    expect(lost).toHaveLength(missed);
    expect(missed).toBeLessThanOrEqual(spawned);
  });
  it("slices every orb on the stroke once, with the generous hit box", () => {
    const state = slice.createSlice(),
      cut: number[] = [];
    const place = (i: number, x: number, y: number) =>
      Object.assign(state.orbs[i], { alive: true, id: i + 1, x, y, r: 0.05 });
    place(0, 0.4, 0.5);
    place(1, 0.8, 0.5);
    // Just outside the drawn radius, inside the hit box.
    place(2, 1.2, 0.5 + 0.05 * (slice.HIT_SCALE - 0.05));
    place(3, 1.0, 0.9);
    const hits = slice.sliceStroke(state, 0.1, 0.5, 1.5, 0.5, (orb) =>
      cut.push(orb.id),
    );
    expect(hits).toBe(3);
    expect(cut).toEqual([1, 2, 3]);
    expect(state.orbs[3].alive).toBe(true);
    expect(slice.sliceStroke(state, 0.1, 0.5, 1.5, 0.5)).toBe(0);
  });
  it("follows two fingertips even when the model swaps their order", () => {
    const state = blades.createBlades();
    blades.updateBlades(state, [0.2, 1.2], [0.5, 0.5], 2, 1000);
    expect(state.blades.map((b) => b.moved)).toEqual([0, 0]);
    // Same hands, listed the other way round, each moved 0.1.
    blades.updateBlades(state, [1.3, 0.3], [0.5, 0.5], 2, 1050);
    const moved = state.blades.map((b) => +b.moved.toFixed(3));
    expect(moved).toEqual([0.1, 0.1]);
    expect(state.blades.every((b) => b.dtMs === 50 && b.live)).toBe(true);
    blades.updateBlades(state, [1.3], [0.5], 1, 1100);
    expect(state.blades.filter((b) => b.live)).toHaveLength(1);
    blades.updateBlades(state, [], [], 0, 1150);
    expect(state.blades.some((b) => b.live)).toBe(false);
    // A hand that comes back starts a new stroke: no slice from the jump.
    blades.updateBlades(state, [0.1], [0.1], 1, 1200);
    expect(state.blades.find((b) => b.live)!.moved).toBe(0);
  });
});
