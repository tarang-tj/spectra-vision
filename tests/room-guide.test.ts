/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  nextStep,
  stageSays,
  type Progress,
} from "../src/panels/ruler/room/guide";

const at = (p: Partial<Progress>): string =>
  nextStep({
    pictures: 0,
    onStage: false,
    ready: false,
    roomTool: false,
    off: [],
    bare: [],
    corners: 0,
    closed: false,
    measured: false,
    ...p,
  });

describe("the next step, from an empty panel to a finished room", () => {
  it("is stated at every stage, and each stage says something else", () => {
    const stages = [
      at({}),
      at({ pictures: 1 }),
      at({ pictures: 1, onStage: true }),
      at({ pictures: 1, onStage: true, ready: true }),
      at({ pictures: 1, onStage: true, ready: true, roomTool: true }),
      at({
        pictures: 2,
        onStage: true,
        ready: true,
        roomTool: true,
        bare: ["Picture 2"],
      }),
      at({
        pictures: 2,
        onStage: true,
        ready: true,
        roomTool: true,
        off: ["Picture 2"],
        corners: 2,
      }),
      at({
        pictures: 2,
        onStage: true,
        ready: true,
        roomTool: true,
        corners: 2,
      }),
      at({
        pictures: 2,
        onStage: true,
        ready: true,
        roomTool: true,
        corners: 4,
      }),
      at({
        pictures: 2,
        onStage: true,
        ready: true,
        roomTool: true,
        corners: 4,
        closed: true,
      }),
      at({
        pictures: 2,
        onStage: true,
        ready: true,
        roomTool: true,
        corners: 4,
        closed: true,
        measured: true,
      }),
    ];
    expect(new Set(stages).size).toBe(stages.length);
    for (const s of stages) expect(s.length).toBeGreaterThan(30);
    expect(stages[0]).toContain("Add picture");
    expect(stages[1]).toContain("press a thumbnail");
    expect(stages[2]).toContain("four corners of the reference");
    expect(stages[2]).toContain("Room tool is greyed out");
    // The Room tool is named, with what it is for, before it is ever chosen.
    expect(stages[3]).toContain("choose Room under What to measure");
    expect(stages[3]).toContain("joins these pictures into one plan");
    expect(stages[4]).toContain("then press Add picture");
    expect(stages[5]).toContain("Picture 2 has no reference yet");
    expect(stages[6]).toContain("Picture 2 is not on the plan");
    expect(stages[6]).toContain("mark two points");
    expect(stages[6]).toContain("Mark in this picture");
    expect(stages[7]).toContain("switching pictures");
    expect(stages[8]).toContain("Close outline");
    expect(stages[9]).toContain("why the outline has no numbers");
    expect(stages[10]).toContain("Save room keeps it");
  });
  it("sends a room in progress back to the Room tool when another tool is chosen", () => {
    expect(at({ pictures: 2, onStage: true, ready: true, corners: 3 })).toBe(
      "Next: choose Room under What to measure to go on with the room.",
    );
  });
});

describe("what the stage shows when it is not a room picture", () => {
  it("names the demo picture and never offers it", () => {
    expect(stageSays("demo", false)).toContain("demo picture");
    expect(stageSays("demo", false)).toContain("cannot be kept");
    expect(stageSays("image", false)).toContain("Keep this picture adds it");
    expect(stageSays("camera", false)).toContain("moving camera picture");
    expect(stageSays("camera", true)).toContain(
      "Keep this frame as a picture adds it",
    );
    expect(stageSays("video", true)).toContain("frozen video frame");
    expect(stageSays(null, false)).toBe("The stage shows no picture.");
  });
});
