/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  IdentityLog,
  JitterWindow,
  MIN_SAMPLES,
} from "../src/panels/lab/stability-core";
import { openStabilityStore } from "../src/panels/lab/stability-store";
import type { StabilitySnapshot } from "../src/panels/lab/stability-store";
import { telemetry } from "../src/telemetry/bus";
import type { Point, TaskResult, VisionResult } from "../src/vision/types";

const noise = (i: number) =>
  Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;

describe("JitterWindow", () => {
  it("is zero for a point that does not move and NaN with too few results", () => {
    const w = new JitterWindow(3000);
    for (let i = 0; i < MIN_SAMPLES - 1; i++) w.add("a", i * 66, 5, 7);
    expect(w.measure(500).value).toBeNaN();
    w.add("a", 600, 5, 7);
    expect(w.measure(600)).toMatchObject({ value: 0, points: 1 });
  });

  it("equals the root of the summed sample variances", () => {
    const w = new JitterWindow(10_000);
    // x alternates +1, -1 (sample variance 8/7 over 8 results), y is constant.
    for (let i = 0; i < 8; i++) w.add("a", i * 100, i % 2 ? -1 : 1, 3);
    expect(w.measure(700).value).toBeCloseTo(Math.sqrt(8 / 7), 12);
    // Both axes add: y alternating by the same amount gives sqrt(2) times more.
    const both = new JitterWindow(10_000);
    for (let i = 0; i < 8; i++)
      both.add("a", i * 100, i % 2 ? -1 : 1, i % 2 ? -1 : 1);
    expect(both.measure(700).value).toBeCloseTo(Math.sqrt(16 / 7), 12);
  });

  it("averages over points and counts only those with enough results", () => {
    const w = new JitterWindow(10_000);
    for (let i = 0; i < 8; i++) {
      w.add("still", i * 100, 1, 1);
      w.add("shaky", i * 100, i % 2 ? -1 : 1, 0);
    }
    for (let i = 0; i < 3; i++) w.add("new", i * 100, i, 0);
    const m = w.measure(700);
    expect(m.points).toBe(2);
    expect(m.value).toBeCloseTo(Math.sqrt(8 / 7) / 2, 12);
  });

  it("covers only the window and forgets points that stopped", () => {
    const w = new JitterWindow(1000);
    // Wild first half-second, then perfectly still: the wild part ages out.
    for (let i = 0; i < 10; i++) w.add("a", i * 100, i % 2 ? 50 : -50, 0);
    for (let i = 10; i < 30; i++) w.add("a", i * 100, 0, 0);
    expect(w.measure(2900).value).toBe(0);
    expect(w.measure(9000).value).toBeNaN();
  });

  it("ignores non-finite positions", () => {
    const w = new JitterWindow(10_000);
    for (let i = 0; i < 8; i++) w.add("a", i * 100, 2, 2);
    w.add("a", 800, NaN, 2);
    w.add("a", NaN, 2, 2);
    expect(w.measure(800)).toMatchObject({ value: 0, samples: 8 });
  });
});

describe("IdentityLog", () => {
  const at = (id: number, x: number, label = "person") => ({
    id,
    label,
    box: { x, y: 0.3, w: 0.1, h: 0.2 },
  });

  it("counts nothing for a steady scene and has no rate before 10 s", () => {
    const log = new IdentityLog();
    for (let i = 0; i < 100; i++) log.update([at(1, 0.4), at(2, 0.7)], i * 100);
    expect(log.measure(5000)).toMatchObject({ switches: 0, idsShown: 2 });
    expect(log.measure(5000).perMinute).toBeNaN();
    expect(log.measure(10_000).perMinute).toBe(0);
  });

  it("counts an id replaced by a new one at the same spot", () => {
    const log = new IdentityLog();
    for (let i = 0; i < 20; i++) log.update([at(1, 0.4)], i * 100);
    for (let i = 20; i < 120; i++) log.update([at(2, 0.42)], i * 100);
    const m = log.measure(12_000);
    expect(m.switches).toBe(1);
    expect(m.perMinute).toBeCloseTo((1 * 60_000) / 12_000, 6);
  });

  it("does not count a different class, a far spot, a late entry or a returning id", () => {
    const log = new IdentityLog();
    log.update([at(1, 0.4)], 0);
    log.update([at(2, 0.4, "chair")], 100);
    log.update([at(3, 0.9)], 200);
    log.update([], 300);
    log.update([at(4, 0.4)], 5000);
    expect(log.measure(5000).switches).toBe(0);
    const back = new IdentityLog();
    back.update([at(1, 0.4)], 0);
    back.update([], 100);
    back.update([at(1, 0.4)], 200);
    expect(back.measure(200).switches).toBe(0);
  });
});

const task = (
  kind: TaskResult["kind"],
  time: number,
  landmarks: Point[][],
  handedness: string[] = [],
): TaskResult => ({
  kind,
  generation: 1,
  time,
  latency: 1,
  delegate: "CPU",
  detections: [],
  landmarks,
  handedness,
});
const resultOf = (t: TaskResult, mode = "hands"): VisionResult => ({
  mode,
  generation: 1,
  time: t.time,
  latency: 1,
  detections: t.detections,
  landmarks: t.landmarks,
  handedness: t.handedness,
  tasks: { [t.kind]: t },
});

describe("stability store", () => {
  it("measures raw and smoothed spread in source pixels, smoothed below raw", () => {
    const seen: StabilitySnapshot[] = [],
      store = openStabilityStore(
        { tracked: false, size: () => ({ width: 1000, height: 500 }) },
        (s) => void seen.push(s),
      );
    for (let i = 0; i < 80; i++) {
      const hand = [
        { x: 0.5 + 0.004 * noise(i), y: 0.5 + 0.004 * noise(i + 50) },
      ];
      telemetry.emit("result", {
        result: resultOf(task("hand", i * 66, [hand], ["Left"])),
        generation: 1,
      });
    }
    store.close();
    const last = seen[seen.length - 1].kinds[0];
    expect(last.kind).toBe("hand");
    expect(last.raw.value).toBeGreaterThan(0.5);
    expect(last.raw.value).toBeLessThan(10);
    expect(last.smooth.value).toBeLessThan(last.raw.value);
    expect(last.raw.points).toBe(1);
    expect(seen[seen.length - 1].identity).toBeNull();
    // A closed store hears nothing more.
    const count = seen.length;
    telemetry.emit("result", {
      result: resultOf(task("hand", 99_000, [[{ x: 0.1, y: 0.1 }]], ["Left"])),
      generation: 1,
    });
    expect(seen).toHaveLength(count);
    expect(telemetry.listening("result")).toBe(false);
  });

  it("tracks objects and reports identity for a tracked mode", () => {
    const seen: StabilitySnapshot[] = [],
      store = openStabilityStore(
        { tracked: true, size: () => ({ width: 800, height: 400 }) },
        (s) => void seen.push(s),
      );
    for (let i = 0; i < 60; i++) {
      const t = task("object", i * 100, []);
      t.detections = [
        {
          label: "chair",
          score: 0.9,
          box: { x: 0.4 + (i % 2) * 0.001, y: 0.3, w: 0.2, h: 0.3 },
        },
      ];
      telemetry.emit("result", {
        result: resultOf(t, "objects"),
        generation: 1,
      });
    }
    store.close();
    const last = seen[seen.length - 1];
    expect(last.boxes!.value).toBeGreaterThan(0);
    expect(last.boxes!.value).toBeLessThan(2);
    expect(last.identity).toMatchObject({ switches: 0, idsShown: 1 });
  });

  it("starts over when the source changes", () => {
    const seen: StabilitySnapshot[] = [],
      store = openStabilityStore(
        { tracked: false, size: () => ({ width: 100, height: 100 }) },
        (s) => void seen.push(s),
      );
    for (let i = 0; i < 20; i++)
      telemetry.emit("result", {
        result: resultOf(
          task("hand", i * 100, [[{ x: 0.1 * noise(i), y: 0 }]], ["Left"]),
        ),
        generation: 1,
      });
    const next = resultOf(task("hand", 5000, [[{ x: 0.5, y: 0.5 }]], ["Left"]));
    next.generation = 2;
    telemetry.emit("result", { result: next, generation: 2 });
    store.close();
    expect(seen[seen.length - 1].kinds[0].raw.value).toBeNaN();
  });
});
