/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Matching a model's boxes to the labels of one picture, the way COCO's
// scorer does (pycocotools/cocoeval.py, evaluateImg). Pure: no DOM, no clock.
import { crowdIou, iou, type Box } from "./iou";

/** The ten overlap thresholds COCO averages over, 0.50 to 0.95. Built the
 * way numpy.linspace builds them, so a threshold is the same number here as
 * in the reference scorer. */
export const THRESHOLDS: readonly number[] = Array.from(
  { length: 10 },
  (_, i) => (i === 9 ? 0.95 : i * (0.45 / 9) + 0.5),
);

/** A labelled object. `crowd` marks a region of many objects: a box on it is
 * neither a hit nor a false box, and the region is never a miss. */
export type Label = { label: string; box: Box; crowd: boolean };
/** A box a model drew, with the model's own class name and score. */
export type Scored = { label: string; score: number; box: Box };
export type Outcome = "hit" | "ignored" | "false";

export type MatchedBox = Scored & {
  /** Per threshold: what the box counts as. */
  outcome: Outcome[];
  /** Per threshold: the index of the label it took, or -1. */
  matched: number[];
  /** Per threshold: its overlap with that label, or 0. */
  overlap: number[];
};
export type MatchedLabel = Label & {
  /** Per threshold: the index of the box that took this label, or -1. A
   * label that is not a crowd and has -1 is a miss at that threshold. A crowd
   * region always has -1. */
  takenBy: number[];
};
/** Both lists are in the order they were given. */
export type PictureMatch = { boxes: MatchedBox[]; labels: MatchedLabel[] };

/** Match one picture's boxes to its labels at each threshold. Boxes and
 * labels are in the same pixel units. A box can only take a label of its own
 * class. Within a class the boxes choose in order of score, highest first,
 * ties in the order given; each takes the free label it overlaps most, an
 * overlap equal to the threshold counts, and a real label wins over a crowd
 * region. One box per label and one label per box, except that a crowd
 * region absorbs any number of boxes. */
export function matchPicture(
  boxes: readonly Scored[],
  labels: readonly Label[],
  thresholds: readonly number[] = THRESHOLDS,
): PictureMatch {
  const count = thresholds.length;
  const outBoxes: MatchedBox[] = boxes.map((box) => ({
      ...box,
      outcome: new Array<Outcome>(count).fill("false"),
      matched: new Array<number>(count).fill(-1),
      overlap: new Array<number>(count).fill(0),
    })),
    outLabels: MatchedLabel[] = labels.map((label) => ({
      ...label,
      takenBy: new Array<number>(count).fill(-1),
    }));
  // Array.prototype.sort is stable, so equal scores keep the given order.
  const order = boxes
    .map((_, index) => index)
    .sort((a, b) => boxes[b].score - boxes[a].score);
  // Real labels first, then crowd regions, each in the order given.
  const real = labels.map((_, index) => index).filter((i) => !labels[i].crowd),
    crowds = labels.map((_, index) => index).filter((i) => labels[i].crowd),
    sorted = [...real, ...crowds];
  for (const b of order) {
    const box = boxes[b],
      mine = sorted.filter((l) => labels[l].label === box.label),
      overlaps = mine.map((l) =>
        labels[l].crowd
          ? crowdIou(box.box, labels[l].box)
          : iou(box.box, labels[l].box),
      );
    for (let t = 0; t < count; t++) {
      let best = Math.min(thresholds[t], 1 - 1e-10),
        taken = -1;
      for (let m = 0; m < mine.length; m++) {
        const l = mine[m],
          crowd = labels[l].crowd;
        // A real label already taken at this threshold is not on offer.
        if (!crowd && outLabels[l].takenBy[t] !== -1) continue;
        // With a real label in hand, the crowd regions are not looked at.
        if (taken !== -1 && !labels[mine[taken]].crowd && crowd) break;
        if (overlaps[m] < best) continue;
        best = overlaps[m];
        taken = m;
      }
      if (taken === -1) continue;
      const l = mine[taken];
      outBoxes[b].matched[t] = l;
      outBoxes[b].overlap[t] = overlaps[taken];
      if (labels[l].crowd) outBoxes[b].outcome[t] = "ignored";
      else {
        outBoxes[b].outcome[t] = "hit";
        outLabels[l].takenBy[t] = b;
      }
    }
  }
  return { boxes: outBoxes, labels: outLabels };
}
