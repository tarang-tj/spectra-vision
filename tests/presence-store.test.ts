import { describe, it, expect, beforeEach } from "vitest";
import { headMatrix } from "../src/measure/angles";
import { presenceStore } from "../src/panels/presence/presence-store";
import {
  buildSummary,
  toJson,
  toMarkdown,
} from "../src/panels/presence/summary";
import { telemetry } from "../src/telemetry/bus";
import type { Point, TaskResult, VisionResult } from "../src/vision/types";

// The store subscribes to the result feed when its module loads; these tests
// drive it through the real bus, like the stage does.
const shoulders = (cx: number): Point[] => {
  const pts: Point[] = Array.from({ length: 33 }, () => ({
    x: cx,
    y: 0.6,
    visibility: 0.99,
  }));
  pts[11] = { x: cx - 0.1, y: 0.4, visibility: 0.99 };
  pts[12] = { x: cx + 0.1, y: 0.4, visibility: 0.99 };
  return pts;
};
const base = {
  generation: 1,
  latency: 5,
  delegate: "CPU" as const,
  detections: [],
  handedness: [],
};
function result(
  time: number,
  opts: { gen?: number; mode?: string; yaw?: number } = {},
): VisionResult {
  const jitter = (time / 100) % 2 ? 0.001 : -0.001;
  const pose: TaskResult = {
    ...base,
    kind: "pose",
    time,
    model: "pose_landmarker_lite.task",
    landmarks: [shoulders(0.5 + jitter)],
  };
  const face: TaskResult = {
    ...base,
    kind: "face",
    time,
    model: "face_landmarker.task",
    landmarks: [
      [
        { x: 0.5, y: 0.3 },
        { x: 0.5, y: 0.3 },
      ],
    ],
    extra: {
      blendshapes: [{}],
      matrices: [headMatrix(opts.yaw ?? jitter * 100, 0, 0)],
    },
  };
  return {
    mode: opts.mode ?? "fusion",
    generation: opts.gen ?? 1,
    time,
    latency: 5,
    detections: [],
    landmarks: [],
    handedness: [],
    tasks: { pose, face },
  };
}
const feed = (r: VisionResult) =>
  telemetry.emit("result", { result: r, generation: r.generation });
/** Results every 100 ms from `from` to `to` (ms). */
function run(
  from: number,
  to: number,
  opts: Parameters<typeof result>[1] = {},
) {
  for (let t = from; t <= to; t += 100) feed(result(t, opts));
}
const state = () => presenceStore.getState();

beforeEach(() => {
  presenceStore.stop();
  presenceStore.clear();
});

describe("presence store", () => {
  it("does nothing without a session", () => {
    run(0, 3000);
    expect(state().phase).toBe("idle");
    expect(presenceStore.recording().results).toBe(0);
    expect(presenceStore.charts().now).toBe(0);
  });

  it("refuses to start without a usable aspect", () => {
    expect(presenceStore.start(NaN)).toBe(false);
    expect(presenceStore.start(0)).toBe(false);
    expect(state().phase).toBe("idle");
  });

  it("calibrates for 5 s, then measures, then summarises on stop", () => {
    expect(presenceStore.start(1.5)).toBe(true);
    expect(state().phase).toBe("calibrating");
    run(1000, 5900);
    expect(state().phase).toBe("calibrating");
    run(6000, 6100);
    expect(state().phase).toBe("measuring");
    expect(state().baseline?.face).not.toBeNull();
    expect(state().baseline?.pose).not.toBeNull();
    run(6200, 12_000);
    presenceStore.stop();
    const s = state();
    expect(s.phase).toBe("done");
    expect(s.endReason).toBe("user");
    expect(s.models.map((m) => m.task).sort()).toEqual(["face", "pose"]);
    const head = s.rows.find((r) => r.id === "head")!;
    expect(head.measured!.value).toBeGreaterThan(99);
    // The hand model never ran: not seen, with the reason, and not zero.
    expect(s.rows.find((r) => r.id === "seen-hand")!.measured).toBeNull();
    expect(s.rows.find((r) => r.id === "time")!.measured!.value).toBeCloseTo(
      6,
      6,
    );
  });

  it("restarts calibration when the stage stops during it", () => {
    presenceStore.start(1);
    run(0, 3000);
    run(60_000, 62_000); // a minute gap: the stage was paused
    expect(state().phase).toBe("calibrating");
    run(62_100, 64_000);
    expect(state().phase).toBe("calibrating"); // 4 s since the restart, not the 7 s in all
    run(64_100, 65_100);
    expect(state().phase).toBe("measuring");
  });

  it("leaves a gap while measuring out of the time covered and counts the pause", () => {
    presenceStore.start(1);
    run(0, 5100);
    run(5200, 6000);
    run(100_000, 100_800);
    presenceStore.stop();
    expect(state().pauses).toBe(1);
    expect(state().coveredMs).toBeLessThan(2000);
  });

  it("ends on a new source generation or another mode", () => {
    presenceStore.start(1);
    run(0, 6000);
    run(6100, 7000);
    feed(result(7100, { gen: 2 }));
    expect(state().phase).toBe("done");
    expect(state().endReason).toBe("source");

    presenceStore.clear();
    presenceStore.start(1);
    run(8000, 14_000);
    feed(result(14_100, { mode: "body" }));
    expect(state().endReason).toBe("mode");
    expect(state().phase).toBe("done");

    presenceStore.clear();
    presenceStore.start(1);
    run(20_000, 21_000);
    feed(result(21_100, { mode: "hands" }));
    expect(state().phase).toBe("idle"); // calibration discarded
    expect(state().rows).toEqual([]);
  });

  it("recomputes the figures when a threshold changes and clamps it to its limits", () => {
    presenceStore.start(1);
    run(0, 5000);
    run(5100, 8000, { yaw: 10 });
    presenceStore.stop();
    const inside = state().rows.find((r) => r.id === "head")!.measured!.value;
    expect(inside).toBeGreaterThan(99);
    presenceStore.setThresholds({ headAngle: 5 });
    expect(
      state().rows.find((r) => r.id === "head")!.measured!.value,
    ).toBeLessThan(5);
    presenceStore.setThresholds({ headAngle: 500, handStill: NaN });
    expect(state().thresholds.headAngle).toBe(90);
    expect(state().thresholds.handStill).toBe(300);
    presenceStore.setThresholds({ headAngle: 15 });
  });

  it("exports JSON with the stated shape and no judging words", () => {
    presenceStore.start(1);
    run(0, 6000);
    run(6100, 9000);
    presenceStore.stop();
    const s = state();
    const device = {
      userAgent: "test",
      browser: "test",
      platform: "test",
      cores: 1,
      memoryGb: null,
      gpu: "none",
    };
    const summary = buildSummary({
      startedAt: s.startedAt!,
      endReason: s.endReason,
      calibrationMs: s.calibrationMs,
      shortened: false,
      pauses: s.pauses,
      thresholds: s.thresholds,
      baseline: s.baseline,
      models: s.models,
      rows: s.rows,
      device,
    });
    const json = JSON.parse(toJson(summary));
    expect(json).toMatchObject({ app: "SPECTRA", kind: "presence", schema: 1 });
    expect(json.metrics.length).toBe(s.rows.length);
    for (const m of json.metrics) {
      if (m.seen) {
        expect(Number.isFinite(m.value)).toBe(true);
        expect(m.error).toBeGreaterThanOrEqual(0);
        expect(m.basis).toBeTruthy();
      } else {
        expect(m.value).toBeNull();
        expect(m.reason).toBeTruthy();
      }
    }
    const markdown = toMarkdown(summary, s.rows);
    expect(markdown).toContain("not seen");
    expect(markdown).toContain("±");
    expect(markdown + toJson(summary)).not.toMatch(
      /eye contact|emotion|\bgood\b|\bbad\b|\bscore\b|\bgrade\b|—/i,
    );
  });
});
