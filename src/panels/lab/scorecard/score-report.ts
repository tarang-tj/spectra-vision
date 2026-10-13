/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// From raw boxes to the scorecard's report. Matching and the AP resamples
// depend only on the boxes, so they are done once per run (`prepare`); the
// figures at the page's Confidence value are worked out again whenever the
// slider moves (`buildReport`), with no model run. Every run is resampled
// with the same weights, so the differences between runs are paired.
import { summarize } from "../../../telemetry/stats";
import { meanAp, poolClasses, type ClassPool } from "./average-precision";
import {
  MIN_OBJECTS,
  RESAMPLES,
  SEED,
  differenceFrom,
  figureFrom,
  resample,
  type Difference,
  type Figure,
  type Statistic,
} from "./bootstrap";
import { matchPicture } from "./match";
import { found, gateFor, pointOf, right } from "./operating-point";
import type { PicturePoint } from "./operating-point";
import type { RunRaw, RunResult } from "./score-run";
import { labelsOf, type ScoreSet } from "./score-set";
import { FLOOR, MAX_BOXES } from "./score-worker";

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

type Samples = (number | null)[];
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

export type ReportRun = {
  id: string;
  label: string;
  model: string;
  modelSha256: string | null;
  /** Whether that hash is the catalogue's; null when either is unknown. */
  matchesCatalogue: boolean | null;
  delegate: string;
  status: "ok" | "failed";
  note: string;
  hits: number | null;
  misses: number | null;
  falses: number | null;
  /** Null for a run that failed or a set with too few labelled objects. */
  found: Figure | null;
  right: Figure | null;
  ap50: Figure | null;
  ap: Figure | null;
  latency: { pictures: number; p50: number; p95: number } | null;
  cocoResults: {
    image_id: number;
    category_id: number;
    bbox: number[];
    score: number;
  }[];
};
export type Comparison = {
  run: string;
  against: string;
  found: Difference;
  ap50: Difference;
};
export type ClassRow = {
  label: string;
  labelled: number;
  /** Found per run, in the order of `runs`; null for a failed run. */
  found: (Figure | null)[];
};
export type ScoreReport = {
  app: "SPECTRA";
  kind: "scorecard";
  schema: 1;
  startedAt: string;
  set: Omit<ScoreSet, "items"> & { checked: string };
  device: unknown;
  protocol: {
    floor: number;
    maxBoxes: number;
    resamples: number;
    seed: number;
    confidence: number;
    shortened: boolean;
    picturesScored: number;
    labelledObjects: number;
    classes: number;
    minObjects: number;
  };
  runs: ReportRun[];
  comparisons: Comparison[];
  byClass: ClassRow[];
  otherClasses: number;
};
export type ReportMeta = {
  startedAt: string;
  device: unknown;
  /** The catalogue's SHA-256 for a model file, or null. */
  pinned(file: string): string | null;
};

export function buildReport(
  result: RunResult,
  prepared: readonly Prepared[],
  weights: readonly ArrayLike<number>[],
  confidence: number,
  meta: ReportMeta,
): ScoreReport {
  const { items: all, ...header } = result.set,
    counts = new Map<string, number>();
  for (const item of result.items)
    for (const box of item.boxes)
      if (!box.crowd) counts.set(box.label, (counts.get(box.label) ?? 0) + 1);
  const objects = [...counts.values()].reduce((sum, n) => sum + n, 0),
    enough = objects >= MIN_OBJECTS,
    big = [...counts].filter(([, n]) => n >= MIN_OBJECTS).sort(),
    byClass: ClassRow[] = big.map(([label, labelled]) => ({
      label,
      labelled,
      found: [],
    }));
  const samples: Samples[] = [];
  const runs = prepared.map(({ raw, ap50, ap }): ReportRun => {
    const { target } = raw,
      pinned = meta.pinned(target.model),
      run: ReportRun = {
        id: target.id,
        label: target.label,
        model: target.model,
        modelSha256: raw.sha256,
        matchesCatalogue: raw.sha256 && pinned ? raw.sha256 === pinned : null,
        delegate: target.delegate,
        status: raw.status,
        note: raw.note,
        hits: null,
        misses: null,
        falses: null,
        found: null,
        right: null,
        ap50: enough ? ap50 : null,
        ap: enough ? ap : null,
        latency: null,
        cocoResults: [],
      };
    if (raw.status !== "ok") {
      samples.push([]);
      for (const row of byClass) row.found.push(null);
      return run;
    }
    const points = pointsOf(raw, result, confidence),
      sum = (key: "hits" | "misses" | "falses") =>
        points.reduce((total, point) => total + point[key], 0),
      hits = sum("hits"),
      misses = sum("misses"),
      falses = sum("falses"),
      foundSamples = resample((w) => found(points, w), weights),
      speed = summarize(raw.pictures.map((picture) => picture.latency));
    samples.push(foundSamples);
    Object.assign(run, { hits, misses, falses });
    if (enough) {
      run.found = figureFrom(found(points), foundSamples, {
        successes: hits,
        total: hits + misses,
      });
      run.right = figureFrom(
        right(points),
        resample((w) => right(points, w), weights),
        { successes: hits, total: hits + falses },
      );
    }
    for (const row of byClass) {
      const of: Statistic = (w) => found(points, w, row.label),
        got = points.reduce(
          (total, point) => total + (point.byClass.get(row.label)?.hits ?? 0),
          0,
        );
      row.found.push(
        figureFrom(of(), resample(of, weights), {
          successes: got,
          total: row.labelled,
        }),
      );
    }
    run.latency = { pictures: speed.count, p50: speed.p50, p95: speed.p95 };
    raw.pictures.forEach((picture, i) => {
      for (const { label, score, box } of picture.boxes) {
        const category_id = cocoId(label);
        if (category_id !== null)
          run.cocoResults.push({
            image_id: result.items[i].id,
            category_id,
            bbox: [box.x, box.y, box.w, box.h],
            score,
          });
      }
    });
    return run;
  });
  // Each finished run against the first finished one, on the same resamples.
  const first = runs.findIndex((run) => run.found && run.ap50),
    comparisons: Comparison[] = [];
  runs.forEach((run, i) => {
    const base = runs[first];
    if (first < 0 || i === first || !run.found || !run.ap50) return;
    const gap = (a: number | null, b: number | null) =>
      a === null || b === null ? null : a - b;
    comparisons.push({
      run: `${run.label} on ${run.delegate}`,
      against: `${base.label} on ${base.delegate}`,
      found: differenceFrom(
        gap(run.found.value, base.found!.value),
        samples[i],
        samples[first],
      ),
      ap50: differenceFrom(
        gap(run.ap50.value, base.ap50!.value),
        prepared[i].ap50Samples,
        prepared[first].ap50Samples,
      ),
    });
  });
  return {
    app: "SPECTRA",
    kind: "scorecard",
    schema: 1,
    startedAt: meta.startedAt,
    set: { ...header, checked: all[0]?.checked ?? "" },
    device: meta.device,
    protocol: {
      floor: FLOOR,
      maxBoxes: MAX_BOXES,
      resamples: RESAMPLES,
      seed: SEED,
      confidence,
      shortened: result.items.length !== all.length,
      picturesScored: result.items.length,
      labelledObjects: objects,
      classes: counts.size,
      minObjects: MIN_OBJECTS,
    },
    runs,
    comparisons,
    byClass,
    otherClasses: counts.size - big.length,
  };
}
