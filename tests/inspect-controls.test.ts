/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which modes get the Confidence slider and the motion map in Inspect.
import { describe, it, expect } from "vitest";
import { modes } from "../src/modes";
import type { ModeDef } from "../src/modes/types";
import { locatesThings } from "../src/panels/inspect";

describe("Inspect controls by mode", () => {
  it("offers Confidence and the motion map in every mode but Depth", () => {
    const shown = Object.fromEntries(
      modes.map((mode) => [mode.id, locatesThings(mode)]),
    );
    expect(shown).toEqual({
      objects: true,
      body: true,
      hands: true,
      face: true,
      segment: true,
      gestures: true,
      fusion: true,
      depth: false,
    });
  });

  it("reads the mode's tasks, not its id", () => {
    const depth = modes.find((mode) => mode.id === "depth")!,
      objects = modes.find((mode) => mode.id === "objects")!,
      task = (mode: ModeDef) =>
        Array.isArray(mode.task) ? mode.task[0] : mode.task;
    // A new reading-only mode under another name gets neither control.
    expect(locatesThings({ ...depth, id: "normals" })).toBe(false);
    // A fusion of a reading and a detector has things to locate.
    expect(
      locatesThings({
        ...depth,
        id: "mix",
        task: [task(depth), task(objects)],
      }),
    ).toBe(true);
  });
});
