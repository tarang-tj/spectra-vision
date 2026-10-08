/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  LEFT_WRIST,
  RIGHT_WRIST,
  attachHands,
} from "../src/modes/lib/fusion-figure";
import type { Point } from "../src/vision/types";

// A pose with shoulders 0.2 apart and one wrist out to each side.
const pose = (visibility = 1): Point[] => {
  const points: Point[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility,
  }));
  points[11] = { x: 0.6, y: 0.3, visibility };
  points[12] = { x: 0.4, y: 0.3, visibility };
  points[LEFT_WRIST] = { x: 0.8, y: 0.4, visibility };
  points[RIGHT_WRIST] = { x: 0.2, y: 0.4, visibility };
  return points;
};
const handAt = (x: number, y: number): Point[] =>
  Array.from({ length: 21 }, () => ({ x, y }));

describe("attaching hands to the body", () => {
  it("joins each hand to the wrist it sits on", () => {
    expect(
      attachHands(pose(), [handAt(0.21, 0.41), handAt(0.79, 0.4)], 1),
    ).toEqual([RIGHT_WRIST, LEFT_WRIST]);
  });
  it("leaves a hand that is far from both wrists unattached", () => {
    expect(attachHands(pose(), [handAt(0.5, 0.9)], 1)).toEqual([null]);
  });
  it("gives a wrist to the nearest hand only", () => {
    expect(
      attachHands(pose(), [handAt(0.26, 0.4), handAt(0.21, 0.4)], 1),
    ).toEqual([null, RIGHT_WRIST]);
  });
  it("ignores wrists the pose model did not see", () => {
    expect(attachHands(pose(0.1), [handAt(0.2, 0.4)], 1)).toEqual([null]);
  });
  it("measures distance in image proportions, not normalized units", () => {
    // 0.07 apart in x: inside the 0.1 reach on a square image, outside it on
    // a 16:10 image where both the gap and the shoulders are wider.
    const near = [handAt(0.27, 0.4)];
    expect(attachHands(pose(), near, 1)).toEqual([RIGHT_WRIST]);
    const tall = pose();
    tall[11] = { x: 0.52, y: 0.3, visibility: 1 };
    tall[12] = { x: 0.48, y: 0.3, visibility: 1 };
    expect(attachHands(tall, near, 1.6)).toEqual([null]);
  });
  it("returns one null per hand when there is no body", () => {
    expect(attachHands(undefined, [handAt(0, 0), handAt(1, 1)], 1)).toEqual([
      null,
      null,
    ]);
    expect(attachHands(pose(), [], 1)).toEqual([]);
  });
});
