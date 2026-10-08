import { describe, it, expect } from "vitest";
import {
  SampleWindow,
  droppedFrames,
  fpsFromTimestamps,
  percentile,
  rate,
  summarize,
} from "../src/telemetry/stats";

describe("percentile", () => {
  it("has no value for an empty window", () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile(new Float64Array(0), 0.95)).toBeNaN();
  });
  it("is the sample itself for a single-sample window", () => {
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.95)).toBe(7);
  });
  it("interpolates linearly between the closest ranks", () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 10);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5);
  });
  it("sorts numerically, does not need sorted input and leaves it alone", () => {
    const values = [100, 9, 20, 1];
    expect(percentile(values, 0.5)).toBe(14.5);
    expect(percentile(values, 1)).toBe(100);
    expect(values).toEqual([100, 9, 20, 1]);
  });
  it("clamps a quantile outside 0..1", () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 2)).toBe(3);
  });
});

describe("summarize", () => {
  it("reports no data for an empty window", () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(s.p50).toBeNaN();
    expect(s.p95).toBeNaN();
    expect(s.max).toBeNaN();
  });
  it("reports the one sample for every figure of a single-sample window", () => {
    expect(summarize([12.5])).toEqual({
      count: 1,
      p50: 12.5,
      p95: 12.5,
      max: 12.5,
    });
  });
  it("keeps p50, p95 and max ordered", () => {
    const values = Array.from({ length: 101 }, (_, i) => 100 - i);
    const s = summarize(values);
    expect(s).toEqual({ count: 101, p50: 50, p95: 95, max: 100 });
    expect(s.p50).toBeLessThanOrEqual(s.p95);
    expect(s.p95).toBeLessThanOrEqual(s.max);
  });
});

describe("frame rate from timestamps", () => {
  it("has no rate for zero or one timestamp, or a zero span", () => {
    expect(fpsFromTimestamps([])).toBeNaN();
    expect(fpsFromTimestamps([500])).toBeNaN();
    expect(fpsFromTimestamps([500, 500])).toBeNaN();
  });
  it("divides the intervals by the time they cover", () => {
    expect(fpsFromTimestamps([0, 100, 200, 300, 400])).toBe(10);
    expect(fpsFromTimestamps([1000, 1500])).toBe(2);
  });
  it("counts over a fixed period", () => {
    expect(rate(300, 20_000)).toBe(15);
    expect(rate(0, 20_000)).toBe(0);
    expect(rate(5, 0)).toBeNaN();
  });
});

describe("dropped-frame detection", () => {
  it("reports nothing without enough frames to know the interval", () => {
    expect(droppedFrames([]).dropped).toBe(0);
    expect(droppedFrames([10]).dropped).toBe(0);
    expect(droppedFrames([10, 43]).dropped).toBe(0);
    expect(droppedFrames([10, 43]).interval).toBeNaN();
  });
  it("finds no drops in an even cadence", () => {
    const times = Array.from({ length: 30 }, (_, i) => i * 33.3);
    const drops = droppedFrames(times);
    expect(drops.dropped).toBe(0);
    expect(drops.interval).toBeCloseTo(33.3, 6);
  });
  it("counts the frames missing from each long gap", () => {
    // 33 ms cadence with one frame missing, then three missing.
    const times = [0, 33, 66, 132, 165, 198, 330, 363, 396];
    expect(droppedFrames(times)).toEqual({ dropped: 4, interval: 33 });
  });
  it("ignores jitter below the threshold", () => {
    expect(droppedFrames([0, 33, 70, 100, 148, 181]).dropped).toBe(0);
  });
  it("copes with identical timestamps", () => {
    expect(droppedFrames([5, 5, 5, 5])).toEqual({ dropped: 0, interval: NaN });
  });
});

describe("sample window", () => {
  it("is empty until something is pushed", () => {
    const window = new SampleWindow(4);
    expect(window.size).toBe(0);
    expect(window.since(0).values).toHaveLength(0);
    expect(summarize(window.since(0).values).count).toBe(0);
  });
  it("holds a single sample", () => {
    const window = new SampleWindow(4);
    window.push(100, 9);
    expect([...window.since(0).values]).toEqual([9]);
    expect(summarize(window.since(0).values).p95).toBe(9);
  });
  it("never grows past its capacity and drops the oldest first", () => {
    const window = new SampleWindow(3);
    for (let i = 1; i <= 10; i++) window.push(i * 10, i);
    expect(window.size).toBe(3);
    expect([...window.since(0).values]).toEqual([8, 9, 10]);
    expect([...window.since(0).times]).toEqual([80, 90, 100]);
  });
  it("slides: only samples inside the time window are returned", () => {
    const window = new SampleWindow(8);
    for (let i = 0; i < 6; i++) window.push(i * 1000, i);
    expect([...window.since(3000).values]).toEqual([3, 4, 5]);
    expect(window.since(99_000).values).toHaveLength(0);
    window.clear();
    expect(window.size).toBe(0);
  });
});
