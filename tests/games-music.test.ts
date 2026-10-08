/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, afterEach } from "vitest";
import { createSfx } from "../src/audio/sfx";
import { createSynth, noteGesture } from "../src/audio/synth";
import * as music from "../src/games/lib/music-logic";
import { createRng } from "../src/games/lib/round";

describe("note quantizing", () => {
  it("snaps every height to a note of the A major pentatonic scale", () => {
    const allowed = new Set([9, 11, 1, 4, 6]); // A B C# E F# as pitch classes
    for (let y = -0.2; y <= 1.2; y += 0.01) {
      const lane = music.quantizeLane(y);
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(music.LANES);
      expect(allowed.has(music.laneMidi(lane) % 12)).toBe(true);
    }
    expect(music.laneMidi(0)).toBe(57);
    expect(music.laneMidi(5)).toBe(69);
    expect(music.midiToHz(69)).toBeCloseTo(440);
  });
  it("puts higher hands on higher notes and each row's centre on its row", () => {
    let previous = music.LANES;
    for (let y = 0; y <= 1; y += 0.02) {
      const lane = music.quantizeLane(y);
      expect(lane).toBeLessThanOrEqual(previous);
      previous = lane;
    }
    expect(music.quantizeLane(0)).toBe(music.LANES - 1);
    expect(music.quantizeLane(1)).toBe(0);
    for (let lane = 0; lane < music.LANES; lane++)
      expect(music.quantizeLane(music.laneCentre(lane))).toBe(lane);
  });
  it("is sticky at a row edge but follows a real move", () => {
    const rowHeight = (music.STAFF_BOTTOM - music.STAFF_TOP) / music.LANES,
      edge = music.laneCentre(3) - rowHeight / 2; // between rows 3 and 4
    expect(music.quantizeLane(edge - rowHeight * 0.1)).toBe(4);
    expect(music.quantizeLane(edge - rowHeight * 0.1, 3)).toBe(3);
    expect(music.quantizeLane(edge + rowHeight * 0.1, 4)).toBe(4);
    expect(music.quantizeLane(edge - rowHeight * 0.3, 3)).toBe(4);
    expect(music.quantizeLane(music.laneCentre(6), 3)).toBe(6);
  });
  it("maps the pinch to a bounded, rising filter cutoff", () => {
    expect(music.pinchToCutoff(0)).toBeCloseTo(350);
    expect(music.pinchToCutoff(5)).toBeCloseTo(6000);
    expect(music.pinchToCutoff(Infinity)).toBeCloseTo(6000);
    expect(music.pinchToCutoff(0.7)).toBeGreaterThan(music.pinchToCutoff(0.4));
  });
});

describe("drum flick", () => {
  it("fires once on a fast downward flick and re-arms after the hand slows", () => {
    const flick = music.createFlick();
    expect(music.flickStep(flick, 0, 0.2, 0)).toBe(false);
    expect(music.flickStep(flick, 0.1, 2.5, 50)).toBe(true);
    // Still moving fast on the next results: the same flick, not a new one.
    expect(music.flickStep(flick, 0.1, 2.5, 100)).toBe(false);
    expect(music.flickStep(flick, 0.1, 1.9, 150)).toBe(false);
    expect(music.flickStep(flick, 0, 0.1, 400)).toBe(false);
    expect(music.flickStep(flick, 0, 2.5, 450)).toBe(true);
  });
  it("ignores upward, sideways, slow and impossible movements", () => {
    const fires = (vx: number, vy: number) =>
      music.flickStep(music.createFlick(), vx, vy, 1000);
    expect(fires(0, -3)).toBe(false);
    expect(fires(3, 2)).toBe(false);
    expect(fires(0, music.FLICK_SPEED - 0.1)).toBe(false);
    expect(fires(0, 40)).toBe(false);
    expect(fires(0.5, music.FLICK_SPEED)).toBe(true);
  });
});

describe("the melody", () => {
  const melody = () => music.makeMelody(createRng(11), 50_000);
  it("is a walk on the staff that always moves and fits inside the round", () => {
    const targets = melody();
    expect(targets.length).toBeGreaterThan(30);
    targets.forEach((target, i) => {
      expect(target.lane).toBeGreaterThanOrEqual(0);
      expect(target.lane).toBeLessThan(music.LANES);
      if (!i) return;
      const leap = Math.abs(target.lane - targets[i - 1].lane),
        gap = target.at - targets[i - 1].at;
      expect(leap).toBeGreaterThanOrEqual(1);
      expect(leap).toBeLessThanOrEqual(2);
      expect(gap).toBeGreaterThanOrEqual(850);
      expect(gap).toBeLessThanOrEqual(1500);
    });
    expect(targets.at(-1)!.at + music.HIT_WINDOW_MS).toBeLessThan(50_000);
    expect(music.noteGap(1)).toBeLessThan(music.noteGap(0));
    expect(melody()).toEqual(targets);
  });
  it("is hit by a hand that arrives on the row inside the window", () => {
    const targets = melody(),
      out = music.createResolved(),
      [first, second] = targets;
    music.resolveTargets(targets, first.at - 600, first.lane, 0, -1, 0, out);
    expect(first.state).toBe(music.PENDING);
    music.resolveTargets(targets, first.at - 300, first.lane, 0, -1, 0, out);
    expect([first.state, out.hits, out.cursor]).toEqual([music.HIT, 1, 1]);
    // The second hand counts too, late but still inside the window.
    const late = second.at + 400;
    music.resolveTargets(targets, late, -1, 0, second.lane, late, out);
    expect([second.state, out.hits, out.misses]).toEqual([music.HIT, 1, 0]);
  });
  it("misses a note once its window has passed, and only once", () => {
    const targets = melody(),
      out = music.createResolved(),
      wrong = (targets[0].lane + 3) % music.LANES;
    music.resolveTargets(targets, targets[0].at + 451, wrong, 0, -1, 0, out);
    expect([targets[0].state, out.misses, out.cursor]).toEqual([
      music.MISSED,
      1,
      1,
    ]);
    music.resolveTargets(targets, targets[0].at + 460, wrong, 0, -1, 0, out);
    expect(out.misses).toBe(0);
  });
  it("gives a hand that never moves at most one note in the whole round", () => {
    for (let lane = 0; lane < music.LANES; lane++) {
      const targets = melody(),
        out = music.createResolved();
      let hits = 0;
      for (let clock = 0; clock < 50_000; clock += 33)
        hits += music.resolveTargets(targets, clock, lane, 0, -1, 0, out).hits;
      expect(hits).toBeLessThanOrEqual(1);
      expect(targets.every((t) => t.state !== music.PENDING)).toBe(true);
    }
  });
});

describe("the synthesizer", () => {
  const original = globalThis.AudioContext;
  afterEach(() => {
    globalThis.AudioContext = original;
  });
  it("stays silent and never throws where WebAudio does not exist", () => {
    const synth = createSynth(),
      sfx = createSfx(synth);
    expect(() => {
      Object.values(sfx).forEach((play) => play(3));
      synth.voice().set(440, 2000, 0.2);
      synth.voice().rest();
      synth.dispose();
    }).not.toThrow();
    expect(synth.stats()).toMatchObject({ context: "none", played: 0 });
  });
  it("makes no AudioContext before a user gesture, one after, and closes it", () => {
    const param = () => ({
        value: 0,
        setValueAtTime() {},
        setTargetAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      }),
      node = () => ({
        connect: (next: unknown) => next,
        disconnect() {},
        start() {},
        stop() {},
        gain: param(),
        frequency: param(),
        Q: param(),
        type: "",
        buffer: null,
      });
    let made = 0,
      closed = 0;
    class FakeContext {
      state = "running";
      currentTime = 0;
      sampleRate = 8000;
      destination = node();
      constructor() {
        made++;
      }
      createGain = node;
      createOscillator = node;
      createBiquadFilter = node;
      createBufferSource = node;
      createBuffer = () => ({ getChannelData: () => new Float32Array(8) });
      resume = async () => {};
      close = async () => void closed++;
    }
    globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
    const synth = createSynth(),
      sfx = createSfx(synth);
    sfx.hit(1);
    synth.voice().set(440, 2000, 0.2);
    expect([made, synth.stats().played]).toEqual([0, 0]);
    noteGesture();
    sfx.hit(1);
    sfx.drum();
    synth.voice().set(440, 2000, 0.2);
    expect(made).toBe(1);
    // hit is two tones, drum is a tone and a noise burst; plus the two voices.
    expect(synth.stats()).toMatchObject({ played: 4, live: 5, voices: 2 });
    synth.dispose();
    expect(closed).toBe(1);
    expect(synth.stats()).toMatchObject({
      context: "none",
      live: 0,
      voices: 0,
    });
    sfx.hit(1);
    expect(made).toBe(1);
  });
});
