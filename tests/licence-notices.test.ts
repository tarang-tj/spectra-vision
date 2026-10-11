/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The licence gate: a model cannot be added to the manifest, and so shipped,
// without a line in the third party notices that names its file.
type Entry = { file: string; license?: string; licenseNote?: string };
const models: Entry[] = JSON.parse(
    readFileSync(resolve("scripts/models.json"), "utf8"),
  ),
  notices = readFileSync(resolve("THIRD_PARTY_NOTICES.md"), "utf8");

/** True when the notices name this file, as code, on a line that also gives a
 * licence. */
export const named = (text: string, file: string): boolean =>
  text
    .split("\n")
    .some(
      (line) => line.includes(`\`${file}\``) && /Apache-2\.0|MIT/.test(line),
    );

describe("third party notices", () => {
  it("has models to check", () => {
    expect(models.length).toBeGreaterThanOrEqual(10);
  });
  it.each(models.map((m) => [m.file, m] as const))(
    "names %s by its file name beside a licence, and the manifest records one",
    (file, entry) => {
      expect(entry.license ?? "").not.toBe("");
      expect(named(notices, file), `${file} is not in the notices`).toBe(true);
    },
  );
  it("would catch a model the notices do not name", () => {
    expect(named(notices, "some_new_model.tflite")).toBe(false);
    // A model name without the file is not enough.
    expect(
      named(
        "| Hand Landmarker, float16 v1 | Apache-2.0 |",
        "hand_landmarker.task",
      ),
    ).toBe(false);
  });
  it("sends the reader to a note wherever the licence is inferred, not stated", () => {
    // The manifest marks two licences "(inferred)". The gesture recognizer's
    // is inferred too but recorded plain with a note, which
    // tests/session-export.test.ts pins; the notices call all three inferred.
    const inferred = models
      .filter((m) => /inferred/.test(m.license ?? ""))
      .map((m) => m.file);
    expect(inferred).toHaveLength(2);
    for (const file of [...inferred, "gesture_recognizer.task"]) {
      const entry = models.find((m) => m.file === file)!,
        line = notices.split("\n").find((l) => l.startsWith(`| \`${file}\``));
      expect(line, file).toMatch(/see note/);
      expect(entry.licenseNote ?? "", file).not.toBe("");
    }
  });
});
