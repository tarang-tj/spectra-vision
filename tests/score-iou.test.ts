/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import { crowdIou, iou, toPixels } from "../src/panels/lab/scorecard/iou";

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe("iou", () => {
  it("is 1 for the same box and 0 for boxes that do not meet", () => {
    expect(iou(box(3, 4, 10, 20), box(3, 4, 10, 20))).toBe(1);
    expect(iou(box(0, 0, 10, 10), box(20, 0, 10, 10))).toBe(0);
    // Touching edges share no area.
    expect(iou(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(0);
  });
  it("is the shared area over the joined area, worked by hand", () => {
    // 10 x 10 and the same box moved 5 right: 50 shared, 150 joined.
    expect(iou(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBeCloseTo(1 / 3, 12);
    // 10 x 10 and a 10 x 5 at one corner: 50 shared, 100 joined.
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 5))).toBe(0.5);
    // A 4 x 4 inside a 10 x 10: 16 over 100.
    expect(iou(box(0, 0, 10, 10), box(2, 2, 4, 4))).toBe(0.16);
  });
  it("is 0 for a box with no area", () => {
    expect(iou(box(0, 0, 0, 0), box(0, 0, 0, 0))).toBe(0);
    expect(iou(box(0, 0, 0, 5), box(0, 0, 10, 10))).toBe(0);
  });
});

describe("crowdIou", () => {
  it("divides the shared area by the box's own area, not the joined area", () => {
    // A 4 x 4 box inside a 100 x 100 crowd region is wholly covered.
    expect(crowdIou(box(10, 10, 4, 4), box(0, 0, 100, 100))).toBe(1);
    // Half of a 10 x 10 box lies in the region: 50 over 100, whatever the
    // region's size. Over the joined area it would be 50 / 10050.
    expect(crowdIou(box(95, 0, 10, 10), box(0, 0, 100, 100))).toBe(0.5);
    expect(crowdIou(box(200, 0, 10, 10), box(0, 0, 100, 100))).toBe(0);
  });
});

describe("toPixels", () => {
  it("scales a box given as fractions of the picture by its own sides", () => {
    expect(toPixels(box(0.25, 0.5, 0.5, 0.25), 640, 480)).toEqual(
      box(160, 240, 320, 120),
    );
  });
});
