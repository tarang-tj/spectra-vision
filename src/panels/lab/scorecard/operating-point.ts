/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a model gets right at one Confidence value: hits, misses and false
// boxes at an overlap of 0.50, picture by picture. Pure: no DOM, no clock.
import { iou, type Box } from "./iou";
import { matchPicture, type Label, type Scored } from "./match";

/** Sharper never shows a box under this score on the stage
 * (src/vision/detector/sharper.ts), so it is not scored under it either. */
export const SHARPER_FLOOR = 0.45;
/** The overlap a box needs with a label of its class to be a hit. */
export const HIT_OVERLAP = 0.5;

/** The lowest score a box may have and still be counted: the Confidence
 * value, and for Sharper never under its own floor. */
export const gateFor = (confidence: number, sharper: boolean): number =>
  sharper ? Math.max(confidence, SHARPER_FLOOR) : confidence;

/** Why a box is false: it sits on an object of its class that a stronger box
 * already took, on a labelled object of another class, or on nothing. */
export type FalseKind = "second box" | "wrong name" | "nothing";
export type PointItem =
  | { kind: "hit"; label: string; score: number; box: Box; overlap: number }
  | {
      kind: "false";
      label: string;
      score: number;
      box: Box;
      why: FalseKind;
      /** For a wrong name: the class of the object the box sits on. */
      labelled?: string;
    }
  /** A box on a crowd region: counted as neither a hit nor false. */
  | { kind: "ignored"; label: string; score: number; box: Box }
  | { kind: "miss"; label: string; box: Box };
export type ClassCounts = { hits: number; misses: number; falses: number };
export type PicturePoint = ClassCounts & {
  ignored: number;
  /** The kept boxes in the order given, then the missed labels. */
  items: PointItem[];
  byClass: Map<string, ClassCounts>;
};

/** The kind of one false box. */
function kindOf(
  box: Scored,
  labels: readonly Label[],
): { why: FalseKind; labelled?: string } {
  let other: Label | null = null,
    best = HIT_OVERLAP;
  for (const label of labels) {
    if (label.crowd) continue;
    const overlap = iou(box.box, label.box);
    if (overlap < HIT_OVERLAP) continue;
    // A free label of its own class would have made it a hit, so this one
    // was taken by a stronger box.
    if (label.label === box.label) return { why: "second box" };
    if (overlap >= best) {
      best = overlap;
      other = label;
    }
  }
  return other
    ? { why: "wrong name", labelled: other.label }
    : { why: "nothing" };
}

/** Score one picture at a gate: keep the boxes at or above it, match them at
 * an overlap of 0.50, and say what each box and each unmatched label is. */
export function pointOf(
  boxes: readonly Scored[],
  labels: readonly Label[],
  gate: number,
): PicturePoint {
  const kept = boxes.filter((box) => box.score >= gate),
    match = matchPicture(kept, labels, [HIT_OVERLAP]),
    point: PicturePoint = {
      hits: 0,
      misses: 0,
      falses: 0,
      ignored: 0,
      items: [],
      byClass: new Map(),
    };
  const count = (name: string, what: keyof ClassCounts) => {
    if (!point.byClass.has(name))
      point.byClass.set(name, { hits: 0, misses: 0, falses: 0 });
    point.byClass.get(name)![what]++;
    point[what]++;
  };
  for (const matched of match.boxes) {
    const { label, score, box } = matched;
    if (matched.outcome[0] === "hit") {
      count(label, "hits");
      const overlap = matched.overlap[0];
      point.items.push({ kind: "hit", label, score, box, overlap });
    } else if (matched.outcome[0] === "ignored") {
      point.ignored++;
      point.items.push({ kind: "ignored", label, score, box });
    } else {
      count(label, "falses");
      const kind = kindOf(matched, labels);
      point.items.push({ kind: "false", label, score, box, ...kind });
    }
  }
  for (const label of match.labels) {
    if (label.crowd || label.takenBy[0] !== -1) continue;
    count(label.label, "misses");
    point.items.push({ kind: "miss", label: label.label, box: label.box });
  }
  return point;
}

/** Weighted totals over the pictures, for every class or for one. */
function totals(
  points: readonly PicturePoint[],
  weights?: ArrayLike<number>,
  label?: string,
): ClassCounts {
  const sum = { hits: 0, misses: 0, falses: 0 };
  points.forEach((point, i) => {
    const weight = weights ? weights[i] : 1,
      counts = label === undefined ? point : point.byClass.get(label);
    if (!weight || !counts) return;
    sum.hits += counts.hits * weight;
    sum.misses += counts.misses * weight;
    sum.falses += counts.falses * weight;
  });
  return sum;
}

/** Found (recall): hits over labelled objects. Null with no labelled object. */
export function found(
  points: readonly PicturePoint[],
  weights?: ArrayLike<number>,
  label?: string,
): number | null {
  const { hits, misses } = totals(points, weights, label);
  return hits + misses > 0 ? hits / (hits + misses) : null;
}

/** Right (precision): hits over boxes kept. Null when no box was kept: that
 * is not 0% right and not 100% right. */
export function right(
  points: readonly PicturePoint[],
  weights?: ArrayLike<number>,
  label?: string,
): number | null {
  const { hits, falses } = totals(points, weights, label);
  return hits + falses > 0 ? hits / (hits + falses) : null;
}
