/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { describe as stats } from "../src/measure/series";
import { telemetry } from "../src/telemetry/bus";
import { onVisionResult } from "../src/vision/result-feed";
import { LandmarkSetSmoother } from "../src/measure/one-euro";
import { ONE_EURO_BY_TASK, ResultSmoother } from "../src/vision/smooth-result";
import type {
  Point,
  TaskKind,
  TaskResult,
  VisionResult,
} from "../src/vision/types";

const jitter = (i: number) =>
  Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;
const task = (
  kind: TaskKind,
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
const result = (
  tasks: TaskResult[],
  mode = "fusion",
  generation = 1,
): VisionResult => {
  const map: VisionResult["tasks"] = {};
  for (const t of tasks) map[t.kind] = t;
  const primary = tasks[0];
  return {
    mode,
    generation,
    time: primary.time,
    latency: 1,
    detections: [],
    landmarks: primary.landmarks,
    handedness: primary.handedness,
    tasks: map,
  };
};
const pose = (i: number): Point[][] => [
  [
    {
      x: 0.5 + 0.01 * jitter(i),
      y: 0.5 + 0.01 * jitter(i + 99),
      z: 0,
      visibility: 0.9,
    },
  ],
];

describe("ResultSmoother", () => {
  it("steadies drawn landmarks and leaves the raw result untouched", () => {
    const smoother = new ResultSmoother(),
      raw: number[] = [],
      out: number[] = [];
    for (let i = 0; i < 150; i++) {
      const r = result([task("pose", i * 66, pose(i))]),
        frozen = JSON.stringify(r),
        s = smoother.apply(r)!;
      expect(JSON.stringify(r)).toBe(frozen);
      raw.push(r.landmarks[0][0].x);
      out.push(s.landmarks[0][0].x);
    }
    expect(stats(out.slice(20)).sd).toBeLessThan(stats(raw.slice(20)).sd * 0.6);
  });

  it("keeps the flat landmarks equal to the primary task's smoothed landmarks", () => {
    const smoother = new ResultSmoother();
    smoother.apply(result([task("pose", 0, pose(0))]));
    const s = smoother.apply(result([task("pose", 66, pose(1))]))!;
    expect(s.landmarks).toBe(s.tasks.pose!.landmarks);
  });

  it("returns the same object for the same result and passes other kinds through", () => {
    const smoother = new ResultSmoother(),
      object = task("object", 0, []),
      r = result([task("pose", 0, pose(0)), object]),
      a = smoother.apply(r)!;
    expect(smoother.apply(r)).toBe(a);
    expect(a.tasks.object).toBe(object);
  });

  it("filters each task once per result of its own (a merged result repeats older ones)", () => {
    const smoother = new ResultSmoother(),
      hand = task("hand", 0, [pose(3)[0]], ["Left"]),
      first = smoother.apply(result([task("pose", 0, pose(0)), hand]))!,
      second = smoother.apply(result([task("pose", 66, pose(1)), hand]))!;
    expect(second.tasks.hand).toBe(first.tasks.hand);
    expect(second.tasks.pose).not.toBe(first.tasks.pose);
  });

  it("starts again on a new source and on a null result", () => {
    const smoother = new ResultSmoother();
    smoother.apply(result([task("pose", 0, pose(0))]));
    smoother.apply(result([task("pose", 66, pose(1))]));
    const far = [[{ x: 0.9, y: 0.1, z: 0, visibility: 1 }]];
    const next = smoother.apply(result([task("pose", 132, far)], "fusion", 2))!;
    expect(next.landmarks[0][0].x).toBe(0.9);
    expect(smoother.apply(null)).toBeNull();
  });
});

describe("per task settings", () => {
  // Real still-input jitter is about a tenth of a percent of the frame, much
  // less than the synthetic amplitude above.
  const hand = (i: number): Point[][] => [
    [
      { x: 0.5 + 0.001 * jitter(i), y: 0.5 + 0.001 * jitter(i + 99), z: 0 },
      { x: 0.4 + 0.001 * jitter(i + 7), y: 0.6 + 0.001 * jitter(i + 31), z: 0 },
    ],
  ];

  it("smooths the hands of a gesture result and keeps its other fields", () => {
    const smoother = new ResultSmoother(),
      raw: number[] = [],
      out: number[] = [];
    let last: TaskResult | undefined;
    for (let i = 0; i < 150; i++) {
      const t = task("gesture", i * 66, hand(i), ["Right"]);
      t.extra = {
        gestures: [{ name: "Open_Palm", score: 0.9, handedness: "Right" }],
      };
      const s = smoother.apply(result([t], "gestures"))!;
      raw.push(t.landmarks[0][0].x);
      out.push(s.tasks.gesture!.landmarks[0][0].x);
      last = s.tasks.gesture;
      expect(last!.extra).toBe(t.extra);
      expect(last!.handedness).toEqual(["Right"]);
    }
    expect(last!.kind).toBe("gesture");
    expect(stats(out.slice(20)).sd).toBeLessThan(stats(raw.slice(20)).sd * 0.5);
  });

  it("uses each task's own One Euro settings", () => {
    for (const kind of ["pose", "hand", "face", "gesture"] as const) {
      const smoother = new ResultSmoother(),
        direct = new LandmarkSetSmoother(ONE_EURO_BY_TASK[kind]);
      for (let i = 0; i < 40; i++) {
        const points = hand(i),
          got = smoother.apply(result([task(kind, i * 66, points, ["Left"])]))!;
        expect(got.tasks[kind]!.landmarks).toEqual(
          direct.smooth(points, i * 66, ["Left"]),
        );
      }
    }
    expect(ONE_EURO_BY_TASK.hand).toEqual(ONE_EURO_BY_TASK.gesture);
  });
});

describe("the result feed", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("delivers every merged result with its generation, until unsubscribed", () => {
    const seen: [VisionResult, number][] = [],
      off = onVisionResult((r, g) => void seen.push([r, g])),
      r = result([task("pose", 0, pose(0))], "body", 4);
    expect(telemetry.listening("result")).toBe(true);
    telemetry.emit("result", { result: r, generation: 4 });
    off();
    telemetry.emit("result", { result: r, generation: 4 });
    expect(seen).toEqual([[r, 4]]);
    expect(telemetry.listening("result")).toBe(false);
  });
  it("does not let a failing listener stop the others", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn(),
      offs = [
        onVisionResult(() => {
          throw new Error("x");
        }),
        onVisionResult(good),
      ];
    telemetry.emit("result", {
      result: result([task("pose", 0, pose(0))]),
      generation: 1,
    });
    offs.forEach((off) => off());
    expect(good).toHaveBeenCalledTimes(1);
  });
});
