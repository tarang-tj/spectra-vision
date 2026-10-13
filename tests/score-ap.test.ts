/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  classAp,
  meanAp,
  poolClasses,
} from "../src/panels/lab/scorecard/average-precision";
import {
  THRESHOLDS,
  matchPicture,
  type Label,
  type Scored,
} from "../src/panels/lab/scorecard/match";

const at = (x: number, y = 0, w = 10, h = 10) => ({ x, y, w, h });
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
const pools = (pictures: { boxes: Scored[]; labels: Label[] }[]) =>
  poolClasses(pictures.map((p) => matchPicture(p.boxes, p.labels, THRESHOLDS)));
const one = (boxes: Scored[], labels: Label[]) => pools([{ boxes, labels }]);

describe("classAp", () => {
  it("works the hand case: hit, false, hit over two labels", () => {
    const [cup] = one(
      [
        scored("cup", 0.9, at(0)),
        scored("cup", 0.8, at(500)),
        scored("cup", 0.7, at(100)),
      ],
      [label("cup", at(0)), label("cup", at(100))],
    );
    // Precision is 1 up to recall 0.5 (51 of the 101 recalls) and 2/3 for
    // the other 50. Eleven points would give (6 + 5 x 2/3) / 11 = 0.848.
    expect(classAp(cup, 0)).toBeCloseTo((51 + (50 * 2) / 3) / 101, 12);
    expect(classAp(cup, 0)).toBeCloseTo(0.83498, 5);
  });
  it("makes precision non-increasing from the right before reading it", () => {
    // false, hit, hit over two labels: raw precision 0, 1/2, 2/3. Every
    // recall up to 1 reads 2/3; without the pass, recall 0 would read 0 and
    // recalls up to 0.5 would read 1/2.
    const [cup] = one(
      [
        scored("cup", 0.9, at(500)),
        scored("cup", 0.8, at(0)),
        scored("cup", 0.7, at(100)),
      ],
      [label("cup", at(0)), label("cup", at(100))],
    );
    expect(classAp(cup, 0)).toBeCloseTo(2 / 3, 12);
  });
  it("gives 0.5 over the ten thresholds for one hit that overlaps by 0.72", () => {
    // 100 x 100 against 100 x 72: IoU 0.72, a hit at 0.50 to 0.70 only.
    const all = one(
      [scored("cup", 0.9, at(0, 0, 100, 72))],
      [label("cup", at(0, 0, 100, 100))],
    );
    expect(THRESHOLDS.map((_, t) => classAp(all[0], t))).toEqual([
      1, 1, 1, 1, 1, 0, 0, 0, 0, 0,
    ]);
    expect(meanAp(all)).toBeCloseTo(0.5, 12);
    expect(meanAp(all, [0])).toBe(1);
  });
  it("leaves a class with boxes but no label out of the mean", () => {
    const all = one(
      [scored("cup", 0.9, at(0)), scored("vase", 0.9, at(300))],
      [label("cup", at(0))],
    );
    const vase = all.find((pool) => pool.label === "vase")!;
    expect(classAp(vase, 0)).toBeNull();
    // Entered as 0, the mean would be 0.5.
    expect(meanAp(all, [0])).toBe(1);
  });
  it("is 0 for a labelled class with no boxes, and that 0 enters the mean", () => {
    const all = one(
      [scored("cup", 0.9, at(0))],
      [label("cup", at(0)), label("fork", at(300))],
    );
    expect(classAp(all.find((pool) => pool.label === "fork")!, 0)).toBe(0);
    expect(meanAp(all, [0])).toBe(0.5);
  });
  it("has no value when nothing is labelled, and is 0 with labels and no boxes", () => {
    expect(meanAp(one([scored("cup", 0.9, at(0))], []))).toBeNull();
    expect(meanAp(one([], [label("cup", at(0))]))).toBe(0);
  });
  it("neither counts a box on a crowd region as false nor a crowd as a label", () => {
    const [book] = one(
      [scored("book", 0.9, at(500, 500)), scored("book", 0.8, at(0))],
      [label("book", at(0)), label("book", at(400, 400, 300, 300), true)],
    );
    expect(classAp(book, 0)).toBe(1);
  });
  it("pools boxes over pictures by score, earlier pictures first on a tie", () => {
    const all = pools([
      { boxes: [scored("cup", 0.5, at(500))], labels: [label("cup", at(0))] },
      { boxes: [scored("cup", 0.5, at(0))], labels: [label("cup", at(0))] },
    ]);
    // false then hit over two labels: precision 1/2 up to recall 0.5.
    expect(classAp(all[0], 0)).toBeCloseTo((51 * 0.5) / 101, 12);
  });
  it("weights whole pictures: a weight of 2 is the picture counted twice", () => {
    const pictures = [
      { boxes: [scored("cup", 0.9, at(0))], labels: [label("cup", at(0))] },
      { boxes: [scored("cup", 0.8, at(500))], labels: [label("cup", at(0))] },
    ];
    const twice = pools([pictures[0], pictures[1], pictures[1]]),
      weighted = pools(pictures);
    expect(meanAp(weighted, [0], [1, 2])).toBeCloseTo(meanAp(twice, [0])!, 12);
    // A picture drawn zero times takes its labels with it.
    expect(meanAp(weighted, [0], [1, 0])).toBe(1);
    expect(meanAp(weighted, [0], [0, 0])).toBeNull();
  });
});
