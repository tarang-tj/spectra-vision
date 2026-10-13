/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The shape of the scorecard's report: what the page shows and what the JSON
// export holds.
import type { Difference, Figure } from "./bootstrap";
import type { ScoreSet } from "./score-set";

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
