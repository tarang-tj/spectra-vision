/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  classifierState,
  onSeenChange,
  record,
  resetSeen,
  seenDetector,
  seenFiner,
  seenVersion,
} from "../src/panels/library/seen";
import {
  matching,
  DETECTOR_LABELS,
  CLASSIFIER_LABELS,
} from "../src/panels/library/labels";
import { finerFor, finerText } from "../src/modes/lib/finer";
import { Tracker } from "../src/vision/tracker";
import type { Detection, VisionResult } from "../src/vision/types";

const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const det = (
  label: string,
  finer?: Detection["finer"],
  b = box,
): Detection => ({
  label,
  score: 0.8,
  box: b,
  ...(finer ? { finer } : {}),
});
const result = (
  mode: string,
  detections: Detection[],
  extra?: unknown,
): VisionResult => ({
  mode,
  generation: 1,
  time: 0,
  latency: 1,
  detections,
  landmarks: [],
  handedness: [],
  tasks: {
    object: {
      kind: "object",
      generation: 1,
      time: 0,
      latency: 1,
      delegate: "CPU",
      detections,
      landmarks: [],
      handedness: [],
      extra: extra as Record<string, unknown>,
    },
  },
});

describe("what the Library has seen", () => {
  beforeEach(resetSeen);
  it("counts a name once per result however many boxes carry it, and keeps the last time", () => {
    record(result("objects", [det("chair"), det("chair"), det("cup")]), 1000);
    record(result("objects", [det("chair")]), 2000);
    expect(seenDetector("chair")).toEqual({ count: 2, last: 2000 });
    expect(seenDetector("cup")).toEqual({ count: 1, last: 1000 });
    expect(seenDetector("person")).toBeUndefined();
  });
  it("counts finer names separately and reads the classifier's state", () => {
    expect(classifierState()).toBeNull();
    record(
      result("objects", [det("chair", { label: "armchair", score: 0.6 })], {
        finer: { state: "ready", floor: 0.3, ms: 4, classified: 1 },
      }),
      10,
    );
    expect(seenFiner("armchair")?.count).toBe(1);
    expect(seenDetector("armchair")).toBeUndefined();
    expect(classifierState()).toMatchObject({
      state: "ready",
      note: "",
      boxes: 1,
      named: 1,
    });
  });
  it("ignores every mode but Objects", () => {
    record(result("segment", [det("hair")]), 1);
    expect(seenDetector("hair")).toBeUndefined();
  });
  it("redraws at most four times a second, and at once when the classifier changes state", () => {
    let calls = 0;
    const off = onSeenChange(() => calls++);
    const start = seenVersion(),
      T = Date.now() + 10_000;
    record(result("objects", [det("cup")]), T);
    record(result("objects", [det("cup")]), T + 100);
    record(result("objects", [det("cup")]), T + 200);
    expect(calls).toBe(1);
    record(result("objects", [det("cup")]), T + 300);
    expect(calls).toBe(2);
    record(
      result("objects", [det("cup")], {
        finer: { state: "loading", floor: 0.3, ms: 0, classified: 0 },
      }),
      T + 301,
    );
    expect(calls).toBe(3);
    expect(seenVersion()).toBe(start + 3);
    off();
  });
});

describe("class lists and finer names", () => {
  it("searches case-insensitively and an empty query returns everything", () => {
    expect(matching(DETECTOR_LABELS, "  CHAIR ")).toContain("chair");
    expect(matching(DETECTOR_LABELS, "")).toBe(DETECTOR_LABELS);
    expect(matching(CLASSIFIER_LABELS, "zzzzzz")).toEqual([]);
    expect(DETECTOR_LABELS).toHaveLength(80);
    expect(CLASSIFIER_LABELS).toHaveLength(1000);
  });
  it("reads a track's own finer name and nothing else", () => {
    const named = det("chair", { label: "armchair", score: 0.6 });
    expect(finerFor(named)?.label).toBe("armchair");
    expect(finerFor(det("chair"))).toBeNull();
    expect(finerText({ label: "armchair", score: 0.414 })).toBe("armchair 41%");
  });
  it("never lends a neighbour's name, through the real tracker", () => {
    // Two chairs that overlap. A has a name; B's crop scored under the floor.
    const a = det("chair", { label: "rocking chair", score: 0.41 }, box),
      b = det("chair", undefined, { ...box, x: 0.13 });
    const tracker = new Tracker();
    tracker.update([a, b], 0);
    const tracks = tracker.update([a, b], 66);
    const names = tracks.map((t) => finerFor(t)?.label ?? null).sort();
    expect(names).toEqual([null, "rocking chair"]);
    const namedTrack = tracks.find((t) => finerFor(t));
    expect(namedTrack?.box.x).toBeCloseTo(a.box.x, 6);
  });
});
