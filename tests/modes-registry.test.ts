/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getMode, modes, tasksOf } from "../src/modes";

type ModelEntry = {
  file: string;
  url: string;
  sha256: string;
  bytes: number;
  license: string;
};
const manifest: ModelEntry[] = JSON.parse(
  readFileSync(resolve("scripts/models.json"), "utf8"),
);
const NEW_MODES = ["face", "segment", "gestures", "fusion"];

describe("the four v2 modes", () => {
  it("are registered after the v1 modes, in this order", () => {
    expect(modes.map((m) => m.id).slice(3, 7)).toEqual(NEW_MODES);
  });
  it("run the task kinds they are named for", () => {
    const kinds = (id: string) => tasksOf(getMode(id)).map((t) => t.kind);
    expect(kinds("face")).toEqual(["face"]);
    expect(kinds("segment")).toEqual(["segment"]);
    expect(kinds("gestures")).toEqual(["gesture"]);
    // Fusion: one worker each, pose first so it fills the flat fields.
    expect(kinds("fusion")).toEqual(["pose", "hand", "face"]);
  });
  it("start every confidence option at the worker's initial threshold", () => {
    for (const id of NEW_MODES)
      for (const task of tasksOf(getMode(id)))
        for (const [name, value] of Object.entries(task.options))
          if (/^min.*(Detection|Presence)Confidence$/.test(name))
            expect([id, name, value]).toEqual([id, name, 0.45]);
  });
  it("ship a labelled demo still that exists", () => {
    for (const id of NEW_MODES) {
      const demo = getMode(id).demo;
      expect(demo.label).toMatch(/^Demo /);
      expect(existsSync(resolve("public", demo.still))).toBe(true);
      if (demo.motion)
        expect(existsSync(resolve("public", demo.motion))).toBe(true);
    }
  });
});

describe("the model manifest", () => {
  it("lists every model a mode asks for", () => {
    const files = new Set(manifest.map((m) => m.file));
    for (const mode of modes)
      for (const task of tasksOf(mode))
        expect([mode.id, files.has(task.model)]).toEqual([mode.id, true]);
  });
  it("records an official MediaPipe URL, a SHA-256, a size and a licence for each", () => {
    expect(new Set(manifest.map((m) => m.file)).size).toBe(manifest.length);
    for (const model of manifest) {
      expect(model.url).toMatch(
        /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.+\/\d+\//,
      );
      expect(model.url.endsWith(`/${model.file}`)).toBe(true);
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(model.bytes) && model.bytes > 0).toBe(true);
      expect(model.license).toBeTruthy();
    }
  });
});
