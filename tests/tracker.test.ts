import { describe, it, expect } from "vitest";
import { Tracker, iou } from "../src/vision/tracker";
import { fit, project, isPinching } from "../src/vision/geometry";
import type { Detection, Point } from "../src/vision/types";
const object = (x: number, label = "person"): Detection => ({
  label,
  score: 0.8,
  box: { x, y: 0.2, w: 0.15, h: 0.4 },
});
describe("temporal association", () => {
  it("keeps a moving object identity through a short missed frame", () => {
    const t = new Tracker(),
      first = t.update([object(0.1)], 0)[0];
    expect(t.update([], 200)).toEqual([]);
    const next = t.update([object(0.13)], 400)[0];
    expect(next.id).toBe(first.id);
    expect(next.trail).toHaveLength(2);
  });
  it("expires old identities and never associates different classes", () => {
    const t = new Tracker(),
      first = t.update([object(0.1)], 0)[0];
    expect(t.update([object(0.1, "chair")], 10)[0].id).not.toBe(first.id);
    expect(t.update([object(0.1)], 1000)[0].id).not.toBe(first.id);
  });
  it("associates detections one to one independent of output order", () => {
    const t = new Tracker();
    const [a, b] = t.update([object(0.1), object(0.6)], 0);
    const [bb, aa] = t.update([object(0.61), object(0.11)], 100);
    expect(bb.id).toBe(b.id);
    expect(aa.id).toBe(a.id);
  });
  it("bounds trail memory and resets identifiers", () => {
    const t = new Tracker();
    for (let i = 0; i < 100; i++) t.update([object(0.1)], i);
    expect(t.update([object(0.1)], 101)[0].trail).toHaveLength(32);
    t.reset();
    expect(t.update([object(0.1)], 102)[0].id).toBe(1);
  });
  it("handles disjoint and degenerate boxes", () => {
    expect(iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 2, y: 2, w: 1, h: 1 })).toBe(0);
    expect(iou({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(0);
  });
});
describe("letterboxing and mirroring", () => {
  it("projects a wide image in a taller canvas and mirrors only image space", () => {
    const r = fit(1600, 900, 400, 300);
    expect(r).toEqual({ x: 0, y: 37.5, w: 400, h: 225 });
    expect(project({ x: 0.1, y: 0.2 }, r)).toEqual({ x: 40, y: 82.5 });
    expect(project({ x: 0.1, y: 0.2 }, r, true)).toEqual({ x: 360, y: 82.5 });
  });
});
describe("pinch hysteresis", () => {
  const points = (ratio: number, scale = 1): Point[] => {
    const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    p[9] = { x: 0, y: 0.2 * scale };
    p[4] = { x: 0, y: 0 };
    p[8] = { x: ratio * 0.2 * scale, y: 0 };
    return p;
  };
  it("does not flicker near entry threshold and is scale normalized", () => {
    expect(isPinching(points(0.25), false)).toBe(true);
    expect(isPinching(points(0.3), true)).toBe(true);
    expect(isPinching(points(0.3), false)).toBe(false);
    expect(isPinching(points(0.35), true)).toBe(false);
    expect(isPinching(points(0.25, 0.5), false)).toBe(true);
  });
  it("accounts for image aspect ratio and missing landmarks", () => {
    expect(isPinching(points(0.2), false, 2)).toBe(false);
    expect(isPinching([], false)).toBe(false);
  });
});
