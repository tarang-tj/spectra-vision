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
    expect(models.length).toBeGreaterThanOrEqual(11);
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
    // The Sharper detector is recorded the same way: the card of the ONNX
    // conversion that is downloaded states no licence, and the licence is
    // the one its authors and its base model's card state.
    const inferred = models
      .filter((m) => /inferred/.test(m.license ?? ""))
      .map((m) => m.file);
    expect(inferred).toHaveLength(2);
    for (const file of [
      ...inferred,
      "gesture_recognizer.task",
      "dfine_s_coco.onnx",
    ]) {
      const entry = models.find((m) => m.file === file)!,
        line = notices.split("\n").find((l) => l.startsWith(`| \`${file}\``));
      expect(line, file).toMatch(/see note/);
      expect(entry.licenseNote ?? "", file).not.toBe("");
    }
  });
  it("names the source, the authors and the missing licence of the Sharper detector", () => {
    const entry = models.find((m) => m.file === "dfine_s_coco.onnx")!,
      note = notices.split("\n").find((l) => l.startsWith("- **D-FINE-S"))!;
    // The authors' repository, the base model's card and the conversion.
    for (const source of [
      "github.com/Peterande/D-FINE",
      "huggingface.co/ustc-community/dfine_s_coco",
      "huggingface.co/onnx-community/dfine_s_coco-ONNX",
    ])
      expect(note, source).toContain(source);
    expect(note).toMatch(/conversion that is downloaded states no license/);
    expect(entry.licenseNote).toMatch(/own card states no licence/);
    // Only the checkpoint trained on COCO alone may be pinned.
    expect((entry as Entry & { url: string }).url).toMatch(
      /\/dfine_s_coco-ONNX\/resolve\/[0-9a-f]{40}\/onnx\/model\.onnx$/,
    );
    expect(JSON.stringify(models)).not.toMatch(/obj2coco-ONNX|obj365-ONNX/);
  });
});

// The scorecard's pictures are other people's photographs. They cannot be
// served without the notices saying whose they are and under what licence.
describe("scorecard set", () => {
  const lines = notices.split("\n"),
    section = notices.slice(
      notices.indexOf("## Scorecard pictures and labels"),
    ),
    license = readFileSync(resolve("LICENSE"), "utf8"),
    set: {
      labels: string;
      labelsUrl: string;
      annotationsSha256: string;
      pictures: number;
      items: { license: string; checked: string }[];
    } = JSON.parse(readFileSync(resolve("public/eval/set.json"), "utf8"));
  it("has a section of its own", () => {
    expect(notices).toContain("\n## Scorecard pictures and labels\n");
  });
  it("names the picture list beside CC BY 2.0 and says where each credit is", () => {
    const line = lines.find(
      (l) => l.includes("`public/eval/set.json`") && /CC BY 2\.0/.test(l),
    );
    expect(line, "set.json is not named beside CC BY 2.0").toBeDefined();
    expect(line).toContain("https://creativecommons.org/licenses/by/2.0/");
    expect(line).toMatch(/author, title and link/);
    expect(line).toMatch(/served unchanged/);
  });
  it("credits the labels to the COCO Consortium under CC BY 4.0", () => {
    const line = lines.find(
      (l) => /COCO Consortium/.test(l) && /CC BY 4\.0/.test(l),
    );
    expect(line, "the labels are not credited").toBeDefined();
    expect(line).toContain("https://creativecommons.org/licenses/by/4.0/");
    expect(line).toContain(set.labelsUrl);
    expect(line).toContain(`\`${set.annotationsSha256}\``);
    expect(set.labels).toBe("COCO Consortium, CC BY 4.0");
  });
  it("says what the set file says: how many, under which licence, read when", () => {
    expect(set.items).toHaveLength(set.pictures);
    expect(new Set(set.items.map((item) => item.license))).toEqual(
      new Set(["CC BY 2.0"]),
    );
    expect(section).toContain(`${set.pictures} photographs`);
    for (const date of new Set(set.items.map((item) => item.checked)))
      expect(section, date).toContain(date);
    expect(section).toMatch(/No picture .*person/);
    expect(section).toMatch(/refuses a (file|picture) whose SHA-256 differs/);
    expect(section).toMatch(/not (kept|included) in this repository/);
  });
  it("no longer says that no COCO photograph is included", () => {
    expect(notices).not.toMatch(/original photographs are not included/);
    expect(notices).toMatch(/COCO training (dataset|set) is not included/);
  });
  it("leaves photographs and their labels out of the reservation of rights", () => {
    const third = license.slice(license.indexOf("THIRD-PARTY MATERIAL"));
    expect(third.replace(/\s+/g, " ")).toMatch(
      /photographs and their labels are excluded from the reservation of rights/,
    );
  });
});
