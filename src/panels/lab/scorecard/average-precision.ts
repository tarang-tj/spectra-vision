/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Average precision the way COCO's scorer works it out
// (pycocotools/cocoeval.py, accumulate and summarize), for boxes already
// matched picture by picture. Pure: no DOM, no clock.
//
// Every function takes an optional weight per picture. A weight of 2 counts
// the picture twice and 0 leaves it out, which is how a resample of whole
// pictures is scored without matching anything again.
import { THRESHOLDS, type Outcome, type PictureMatch } from "./match";

const CODE: Record<Outcome, number> = { false: 0, hit: 1, ignored: 2 };

/** One class's boxes from every picture, in the order they are counted. */
export type ClassPool = {
  label: string;
  /** Labelled objects of this class that are not crowd regions. */
  labels: number;
  /** The same count, per picture. */
  labelsIn: Float64Array;
  /** Per box, strongest first: the picture it came from. */
  picture: Int32Array;
  score: Float64Array;
  /** Per threshold, per box: 0 false, 1 hit, 2 on a crowd region. */
  outcome: Uint8Array[];
};

/** Pool the matched pictures by class. Boxes are ordered by score, highest
 * first; on a tie the earlier picture comes first, then the order within the
 * picture. Give the pictures in ascending image id to break ties as the
 * reference scorer does. Classes come back in name order. */
export function poolClasses(
  matches: readonly PictureMatch[],
  thresholds = THRESHOLDS.length,
): ClassPool[] {
  type Entry = { picture: number; score: number; outcome: Outcome[] };
  const entries = new Map<string, Entry[]>(),
    labelsIn = new Map<string, Float64Array>();
  const touch = (name: string) => {
    if (!entries.has(name)) {
      entries.set(name, []);
      labelsIn.set(name, new Float64Array(matches.length));
    }
  };
  matches.forEach((match, picture) => {
    for (const label of match.labels) {
      touch(label.label);
      if (!label.crowd) labelsIn.get(label.label)![picture]++;
    }
    for (const box of match.boxes) {
      touch(box.label);
      entries
        .get(box.label)!
        .push({ picture, score: box.score, outcome: box.outcome });
    }
  });
  return [...entries.keys()].sort().map((label) => {
    // A stable sort: equal scores stay in picture order.
    const list = entries.get(label)!.sort((a, b) => b.score - a.score),
      counts = labelsIn.get(label)!;
    return {
      label,
      labels: counts.reduce((sum, n) => sum + n, 0),
      labelsIn: counts,
      picture: Int32Array.from(list, (entry) => entry.picture),
      score: Float64Array.from(list, (entry) => entry.score),
      outcome: Array.from({ length: thresholds }, (_, t) =>
        Uint8Array.from(list, (entry) => CODE[entry.outcome[t]]),
      ),
    };
  });
}

/** The 101 recalls precision is read at: 0, 0.01, ..., 1, as numpy.linspace
 * gives them. */
const RECALLS = Float64Array.from({ length: 101 }, (_, i) =>
  i === 100 ? 1 : i * 0.01,
);
// Scratch space for the recall and precision after each hit, reused between
// calls: a resample calls classAp a million times.
let recallAt = new Float64Array(256),
  precisionAt = new Float64Array(256);

/** Average precision of one class at the threshold with index `t`: precision
 * made non-increasing from the right, read at 101 recalls, averaged. Null
 * when the class has no labelled object (in the pictures the weights keep),
 * which leaves it out of every mean. A labelled class with no box scores 0. */
export function classAp(
  pool: ClassPool,
  t: number,
  weights?: ArrayLike<number>,
): number | null {
  let labels = pool.labels;
  if (weights) {
    labels = 0;
    for (let p = 0; p < pool.labelsIn.length; p++)
      labels += pool.labelsIn[p] * weights[p];
  }
  if (!(labels > 0)) return null;
  const outcome = pool.outcome[t],
    n = outcome.length;
  if (recallAt.length < n) {
    recallAt = new Float64Array(n * 2);
    precisionAt = new Float64Array(n * 2);
  }
  // Recall only moves at a hit, so only the hits are kept as points. A box on
  // a crowd region adds to neither count.
  let hits = 0,
    falses = 0,
    points = 0;
  for (let i = 0; i < n; i++) {
    const weight = weights ? weights[pool.picture[i]] : 1;
    if (!weight || outcome[i] === 2) continue;
    if (outcome[i] === 0) falses += weight;
    else {
      hits += weight;
      recallAt[points] = hits / labels;
      precisionAt[points++] = hits / (hits + falses);
    }
  }
  for (let i = points - 1; i > 0; i--)
    if (precisionAt[i] > precisionAt[i - 1])
      precisionAt[i - 1] = precisionAt[i];
  // The first point whose recall reaches each of the 101 values; 0 where
  // recall never gets there.
  let sum = 0,
    at = 0;
  for (let r = 0; r < RECALLS.length; r++) {
    while (at < points && recallAt[at] < RECALLS[r]) at++;
    if (at === points) break;
    sum += precisionAt[at];
  }
  return sum / RECALLS.length;
}

/** The mean of classAp over the classes that have one and over the given
 * thresholds (all ten when none are named: COCO's AP; `[0]` alone: AP50).
 * Null when no class has a labelled object. */
export function meanAp(
  pools: readonly ClassPool[],
  thresholds?: readonly number[],
  weights?: ArrayLike<number>,
): number | null {
  let sum = 0,
    count = 0;
  for (const pool of pools) {
    const indexes = thresholds ?? pool.outcome.map((_, t) => t);
    for (const t of indexes) {
      const ap = classAp(pool, t, weights);
      if (ap === null) break;
      sum += ap;
      count++;
    }
  }
  return count ? sum / count : null;
}
