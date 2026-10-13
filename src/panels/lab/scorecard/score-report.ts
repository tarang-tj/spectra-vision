/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// From prepared runs to the scorecard's report. Matching and the AP resamples
// are done once per run (`prepare` in score-prepare.ts); the figures at the
// page's Confidence value are worked out again whenever the slider moves
// (`buildReport`), with no model run. Every run is resampled with the same
// weights, so the differences between runs are paired.
import { summarize } from "../../../telemetry/stats";
import {
  MIN_OBJECTS,
  RESAMPLES,
  SEED,
  differenceFrom,
  figureFrom,
  resample,
  type Statistic,
} from "./bootstrap";
import { found, right } from "./operating-point";
import { cocoId, pointsOf, type Prepared, type Samples } from "./score-prepare";
import type { RunResult } from "./score-run";
import type {
  ClassRow,
  Comparison,
  ReportMeta,
  ReportRun,
  ScoreReport,
} from "./score-types";
import { FLOOR, MAX_BOXES } from "./score-worker";

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
