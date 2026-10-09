/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import maps from "./label-maps.json";

// The class lists the loaded models can name. They were extracted from the
// label file inside each model file, not typed (label-maps.json records the
// model, its SHA-256 and the file member; tests/library-labels.test.ts checks
// them against the model files).
export const DETECTOR_LABELS: readonly string[] = maps.detector.labels;
export const CLASSIFIER_LABELS: readonly string[] = maps.classifier.labels;
export const DETECTOR_SOURCE = `${maps.detector.model} (also ${maps.detector.also.join(", ")})`;
export const CLASSIFIER_SOURCE = maps.classifier.model;

/** Labels that contain the query, case-insensitively and ignoring extra spaces. */
export function matching(
  labels: readonly string[],
  query: string,
): readonly string[] {
  const q = query.trim().toLowerCase();
  return q ? labels.filter((label) => label.toLowerCase().includes(q)) : labels;
}
