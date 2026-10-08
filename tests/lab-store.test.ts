import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { telemetry } from "../src/telemetry/bus";
import { WINDOW_MS, openLabStore } from "../src/panels/lab/lab-store";
import type { LabSnapshot } from "../src/panels/lab/lab-store";

describe("lab store", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const frame = { time: 0, dt: 0, drawMs: 0 };
  const inference = (latency: number) =>
    telemetry.emit("inference", {
      kind: "pose",
      latency,
      time: 0,
      delegate: "CPU",
    });

  it("listens only while open", () => {
    expect(telemetry.listening("frame")).toBe(false);
    expect(telemetry.listening("inference")).toBe(false);
    const store = openLabStore(["pose"], () => {});
    expect(telemetry.listening("frame")).toBe(true);
    expect(telemetry.listening("inference")).toBe(true);
    store.close();
    expect(telemetry.listening("frame")).toBe(false);
    expect(telemetry.listening("inference")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports measured figures over the sliding window and nothing before data", () => {
    const snapshots: LabSnapshot[] = [];
    const store = openLabStore(["pose"], (s) => snapshots.push(s));
    vi.advanceTimersByTime(1000);
    telemetry.emit("frame", frame);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].latency.pose).toMatchObject({ count: 0 });
    expect(snapshots[0].latency.pose!.p50).toBeNaN();
    expect(snapshots[0].processedFps).toBeNaN();
    expect(snapshots[0].renderFps).toBeNaN();
    expect(snapshots[0].dropped).toBe(0);
    // Two seconds of a 25 fps stage with a 5 fps model. The store refreshes
    // on the first frame at least 250 ms after the last refresh: frames 7,
    // 14, ... 49, so the last snapshot has seen the results of frames 5 to 45.
    for (let i = 1; i <= 50; i++) {
      vi.advanceTimersByTime(40);
      telemetry.emit("frame", frame);
      if (i % 5 === 0) inference(i);
    }
    const last = snapshots.at(-1)!;
    expect(snapshots).toHaveLength(8);
    expect(last.renderFps).toBeCloseTo(25, 6);
    expect(last.processedFps).toBeCloseTo(5, 6);
    expect(last.latency.pose).toEqual({ count: 9, p50: 25, p95: 43, max: 45 });
    expect(last.dropped).toBe(0);
    expect(last.frameInterval).toBe(40);
    // The store itself is live: it already holds the result of frame 50.
    expect(store.latencySamples("pose", last.now).values).toHaveLength(10);
    // Samples older than the window leave the figures.
    vi.advanceTimersByTime(WINDOW_MS + 1);
    telemetry.emit("frame", frame);
    expect(snapshots.at(-1)!.latency.pose!.count).toBe(0);
    expect(snapshots.at(-1)!.latency.pose!.p95).toBeNaN();
    store.close();
  });

  it("ignores tasks of another mode and keeps its buffers bounded", () => {
    const snapshots: LabSnapshot[] = [];
    const store = openLabStore(["hand"], (s) => snapshots.push(s));
    for (let i = 0; i < 5000; i++) {
      vi.advanceTimersByTime(1);
      inference(3);
      telemetry.emit("inference", {
        kind: "hand",
        latency: 4,
        time: 0,
        delegate: "CPU",
      });
      telemetry.emit("frame", frame);
    }
    const last = snapshots.at(-1)!;
    expect(last.latency.pose).toBeUndefined();
    expect(last.latency.hand!.count).toBe(512);
    expect(
      store.latencySamples("hand", last.now).values.length,
    ).toBeLessThanOrEqual(512);
    store.close();
  });
});
