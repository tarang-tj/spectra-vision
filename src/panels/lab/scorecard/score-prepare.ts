/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a run needs worked out once, whatever the Confidence value: its boxes
// matched against the labels and its AP resampled. Also COCO's category ids,
// which the JSON export's raw boxes carry.
import { meanAp, poolClasses, type ClassPool } from "./average-precision";
import { figureFrom, resample, type Figure, type Statistic } from "./bootstrap";
import { matchPicture } from "./match";
import { gateFor, pointOf, type PicturePoint } from "./operating-point";
import type { RunRaw, RunResult } from "./score-run";
import { labelsOf } from "./score-set";

// COCO's 80 category names in its own order, and the id each has in
// instances_val2017.json (the ids skip some numbers). The names are the
// models' names; tests/score-report.test.ts holds the list to
// src/panels/library/label-maps.json.
const COCO_NAMES =
  "person|bicycle|car|motorcycle|airplane|bus|train|truck|boat|traffic light|fire hydrant|stop sign|parking meter|bench|bird|cat|dog|horse|sheep|cow|elephant|bear|zebra|giraffe|backpack|umbrella|handbag|tie|suitcase|frisbee|skis|snowboard|sports ball|kite|baseball bat|baseball glove|skateboard|surfboard|tennis racket|bottle|wine glass|cup|fork|knife|spoon|bowl|banana|apple|sandwich|orange|broccoli|carrot|hot dog|pizza|donut|cake|chair|couch|potted plant|bed|dining table|toilet|tv|laptop|mouse|remote|keyboard|cell phone|microwave|oven|toaster|sink|refrigerator|book|clock|vase|scissors|teddy bear|hair drier|toothbrush";
const COCO_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 46,
  47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
  67, 70, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89,
  90,
];
const NAMES = COCO_NAMES.split("|");
/** COCO's category id for a class name, or null for a name it does not have. */
export const cocoId = (label: string): number | null =>
  COCO_IDS[NAMES.indexOf(label)] ?? null;

export type Samples = (number | null)[];
/** What one run needs worked out once, whatever the Confidence value. */
export type Prepared = {
  raw: RunRaw;
  pools: ClassPool[];
  ap50: Figure | null;
  ap: Figure | null;
  ap50Samples: Samples;
};

/** Match every run's boxes and resample its AP. The resamples are done in
 * slices with a pause between them, so the page stays responsive. */
export async function prepare(
  result: RunResult,
  weights: readonly ArrayLike<number>[],
  pause: () => Promise<void> = () => new Promise((done) => setTimeout(done)),
): Promise<Prepared[]> {
  const labels = result.items.map(labelsOf),
    prepared: Prepared[] = [];
  for (const raw of result.runs) {
    if (raw.status !== "ok") {
      prepared.push({ raw, pools: [], ap50: null, ap: null, ap50Samples: [] });
      continue;
    }
    // Pictures go in the set's order: equal scores are broken by it.
    const pools = poolClasses(
        raw.pictures.map((picture, i) =>
          matchPicture(picture.boxes, labels[i]),
        ),
      ),
      ap50: Statistic = (w) => meanAp(pools, [0], w),
      ap: Statistic = (w) => meanAp(pools, undefined, w),
      ap50Samples: Samples = [],
      apSamples: Samples = [];
    for (let from = 0; from < weights.length; from += 100) {
      ap50Samples.push(...resample(ap50, weights, from, from + 100));
      apSamples.push(...resample(ap, weights, from, from + 100));
      await pause();
    }
    prepared.push({
      raw,
      pools,
      ap50: figureFrom(ap50(), ap50Samples),
      ap: figureFrom(ap(), apSamples),
      ap50Samples,
    });
  }
  return prepared;
}

/** One run's pictures at the page's Confidence value. */
export const pointsOf = (
  raw: RunRaw,
  result: RunResult,
  confidence: number,
): PicturePoint[] =>
  raw.pictures.map((picture, i) =>
    pointOf(
      picture.boxes,
      labelsOf(result.items[i]),
      gateFor(confidence, raw.target.sharper),
    ),
  );
