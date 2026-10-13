/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  THRESHOLDS,
  matchPicture,
  type Label,
  type Scored,
} from "../src/panels/lab/scorecard/match";

const at = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const label = (name: string, box: Label["box"], crowd = false): Label => ({
  label: name,
  box,
  crowd,
});
const scored = (name: string, score: number, box: Scored["box"]): Scored => ({
  label: name,
  score,
  box,
});
const outcomes = (
  boxes: Scored[],
  labels: Label[],
  thresholds: readonly number[] = [0.5],
) => matchPicture(boxes, labels, thresholds).boxes.map((b) => b.outcome[0]);

describe("matchPicture", () => {
  it("uses the ten COCO thresholds from 0.50 to 0.95", () => {
    expect(THRESHOLDS).toHaveLength(10);
    expect(THRESHOLDS[0]).toBe(0.5);
    expect(THRESHOLDS[9]).toBe(0.95);
    expect(THRESHOLDS[4]).toBeCloseTo(0.7, 12);
  });
  it("counts an overlap exactly at the threshold", () => {
    // 10 x 10 and 10 x 5 at one corner: IoU is exactly 0.5.
    const result = matchPicture(
      [scored("cup", 0.9, at(0, 0, 10, 5))],
      [label("cup", at(0, 0, 10, 10))],
      [0.5, 0.55],
    );
    expect(result.boxes[0].outcome).toEqual(["hit", "false"]);
    expect(result.boxes[0].matched).toEqual([0, -1]);
    expect(result.boxes[0].overlap[0]).toBe(0.5);
    expect(result.labels[0].takenBy).toEqual([0, -1]);
  });
  it("gives one label to the stronger of two boxes; the other is false", () => {
    const result = matchPicture(
      [
        scored("cup", 0.6, at(0, 0, 10, 10)),
        scored("cup", 0.8, at(1, 0, 10, 10)),
      ],
      [label("cup", at(0, 0, 10, 10))],
      [0.5],
    );
    // Results come back in the order the boxes were given.
    expect(result.boxes.map((b) => b.outcome[0])).toEqual(["false", "hit"]);
    expect(result.labels[0].takenBy).toEqual([1]);
  });
  it("gives a box the free label when the label it overlaps most is taken", () => {
    const labels = [
      label("cup", at(0, 0, 10, 10)),
      label("cup", at(4, 0, 10, 10)),
    ];
    const result = matchPicture(
      [
        scored("cup", 0.9, at(0, 0, 10, 10)), // takes the first label
        // Overlaps the first label by 0.82 and the second by 0.54.
        scored("cup", 0.8, at(1, 0, 10, 10)),
      ],
      labels,
      [0.5],
    );
    expect(result.boxes.map((b) => b.matched[0])).toEqual([0, 1]);
    expect(result.boxes.map((b) => b.outcome[0])).toEqual(["hit", "hit"]);
  });
  it("never matches a label of another class", () => {
    expect(
      outcomes(
        [scored("bowl", 0.9, at(0, 0, 10, 10))],
        [label("cup", at(0, 0, 10, 10))],
      ),
    ).toEqual(["false"]);
  });
  it("prefers a real label to a crowd region, and ignores boxes on a crowd alone", () => {
    const labels = [
      // The crowd is listed first on purpose: real labels are tried first.
      label("book", at(0, 0, 100, 100), true),
      label("book", at(0, 0, 10, 10)),
    ];
    const result = matchPicture(
      [
        scored("book", 0.9, at(0, 0, 10, 10)), // on the real label
        scored("book", 0.8, at(50, 50, 10, 10)), // in the crowd only
        scored("book", 0.7, at(70, 70, 10, 10)), // a second one in the crowd
        scored("book", 0.6, at(200, 200, 10, 10)), // on nothing
      ],
      labels,
      [0.5],
    );
    expect(result.boxes.map((b) => b.outcome[0])).toEqual([
      "hit",
      "ignored",
      "ignored",
      "false",
    ]);
    expect(result.boxes[0].matched[0]).toBe(1);
    // A crowd region is never a miss and never "taken".
    expect(result.labels[0].takenBy).toEqual([-1]);
  });
  it("keeps the given order between boxes with the same score", () => {
    const first = matchPicture(
      [
        scored("cup", 0.7, at(0, 0, 10, 10)),
        scored("cup", 0.7, at(1, 0, 10, 10)),
        scored("cup", 0.7, at(0, 1, 10, 10)),
      ],
      [label("cup", at(0, 0, 10, 10))],
      [0.5],
    );
    expect(first.boxes.map((b) => b.outcome[0])).toEqual([
      "hit",
      "false",
      "false",
    ]);
  });
  it("reports a label no box matched, per threshold", () => {
    const result = matchPicture(
      [scored("cup", 0.9, at(0, 0, 10, 8))],
      [label("cup", at(0, 0, 10, 10)), label("fork", at(50, 50, 5, 5))],
      [0.5, 0.9],
    );
    expect(result.labels.map((l) => l.takenBy)).toEqual([
      [0, -1],
      [-1, -1],
    ]);
  });
});
