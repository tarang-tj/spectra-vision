/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import maps from "../src/panels/library/label-maps.json";

// The Library's class lists were extracted from the models, not typed. This
// reads them out of the model files again (the label file is a zip appended
// to the .tflite) and checks they agree, and that the model is the pinned one.
function member(file: string, name: string): string {
  const data = readFileSync(resolve("public/models", file));
  let eocd = data.length - 22;
  while (eocd >= 0 && data.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`${file}: no zip directory`);
  const count = data.readUInt16LE(eocd + 10),
    size = data.readUInt32LE(eocd + 12),
    // Offsets are relative to where the zip starts, after the flatbuffer.
    start = eocd - size - data.readUInt32LE(eocd + 16);
  let at = eocd - size;
  for (let i = 0; i < count; i++) {
    const method = data.readUInt16LE(at + 10),
      packed = data.readUInt32LE(at + 20),
      nameLength = data.readUInt16LE(at + 28),
      extra = data.readUInt16LE(at + 30),
      comment = data.readUInt16LE(at + 32),
      local = start + data.readUInt32LE(at + 42),
      entry = data.toString("utf8", at + 46, at + 46 + nameLength);
    if (entry === name) {
      const from =
          local +
          30 +
          data.readUInt16LE(local + 26) +
          data.readUInt16LE(local + 28),
        raw = data.subarray(from, from + packed);
      return (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
    }
    at += 46 + nameLength + extra + comment;
  }
  throw new Error(`${file}: no ${name}`);
}
const clean = (text: string) =>
  text.split("\n").filter((line) => line.trim() && line.trim() !== "???");

describe("label-maps.json", () => {
  for (const [kind, entry] of Object.entries({
    detector: maps.detector,
    classifier: maps.classifier,
  })) {
    it(`${kind}: the labels are the model file's own and the model is the pinned one`, () => {
      expect(entry.labels).toEqual(clean(member(entry.model, entry.member)));
      const hash = createHash("sha256")
        .update(readFileSync(resolve("public/models", entry.model)))
        .digest("hex");
      expect(hash).toBe(entry.sha256);
      const pinned = (
        JSON.parse(readFileSync(resolve("scripts/models.json"), "utf8")) as {
          file: string;
          sha256: string;
        }[]
      ).find((m) => m.file === entry.model);
      expect(pinned?.sha256).toBe(entry.sha256);
    });
  }
  it("the larger detector carries the same classes", () => {
    for (const file of maps.detector.also)
      expect(clean(member(file, "labels.txt"))).toEqual(maps.detector.labels);
  });
});
