import { describe, it, expect } from "vitest";
import { headMatrix } from "../src/measure/angles";
import { SignalExtractor } from "../src/panels/presence/signals";
import type {
  Point,
  TaskKind,
  TaskResult,
  VisionResult,
} from "../src/vision/types";

const task = (
  kind: TaskKind,
  time: number,
  landmarks: Point[][],
  extra?: Record<string, unknown>,
  handedness: string[] = [],
): TaskResult => ({
  kind,
  generation: 1,
  time,
  latency: 5,
  delegate: "CPU",
  detections: [],
  landmarks,
  handedness,
  extra,
});
const merged = (
  time: number,
  tasks: Partial<Record<TaskKind, TaskResult>>,
): VisionResult => ({
  mode: "fusion",
  generation: 1,
  time,
  latency: 5,
  detections: [],
  landmarks: [],
  handedness: [],
  tasks,
});
/** A body with the shoulders at x = cx +- half, y = 0.4, all points visible. */
const body = (cx: number, half = 0.1): Point[] => {
  const pts: Point[] = Array.from({ length: 33 }, () => ({
    x: cx,
    y: 0.6,
    visibility: 0.99,
  }));
  pts[11] = { x: cx - half, y: 0.4, visibility: 0.99 };
  pts[12] = { x: cx + half, y: 0.4, visibility: 0.99 };
  return pts;
};
const palm = (cx: number): Point[] =>
  Array.from({ length: 21 }, () => ({ x: cx, y: 0.7 }));
const faceTask = (time: number, yaw: number, pitch: number, smile = 0) =>
  task(
    "face",
    time,
    [Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.3 }))],
    {
      blendshapes: [{ mouthSmileLeft: smile, mouthSmileRight: smile }],
      matrices: [headMatrix(yaw, pitch, 0)],
    },
  );

describe("signal extractor", () => {
  it("reads head direction from the face matrix and the nose point", () => {
    const x = new SignalExtractor();
    const s = x.ingest(merged(1000, { face: faceTask(1000, 20, -7) }), 1.5);
    expect(s.face!.yaw).toBeCloseTo(20, 6);
    expect(s.face!.pitch).toBeCloseTo(-7, 6);
    expect(s.face!.nose).toEqual({ x: 0.5, y: 0.3 });
    expect(s.pose).toBeUndefined();
  });

  it("puts lengths in image-height units with the source aspect", () => {
    const x = new SignalExtractor();
    const s = x.ingest(
      merged(0, { pose: task("pose", 0, [body(0.5, 0.1)]) }),
      2,
    );
    // Shoulder distance 0.2 of the width = 0.4 heights at aspect 2.
    expect(s.pose!.width).toBeCloseTo(0.4, 9);
    expect(s.pose!.x).toBeCloseTo(1, 9);
    expect(s.pose!.motion).toBeNaN();
  });

  it("takes speeds between consecutive new results and counts a repeated result once", () => {
    const x = new SignalExtractor();
    const a = task("pose", 0, [body(0.5)]),
      b = task("pose", 200, [body(0.6)]);
    x.ingest(merged(0, { pose: a }), 1);
    const again = x.ingest(merged(50, { pose: a }), 1);
    expect(again.pose).toBeUndefined(); // same task result: nothing new
    const s = x.ingest(merged(200, { pose: b }), 1);
    // Every tracked point moved 0.1 in 0.2 s.
    expect(s.pose!.motion).toBeCloseTo(0.5, 9);
  });

  it("returns null for a pose with no visible shoulders and a face with no matrix", () => {
    const x = new SignalExtractor();
    const pts = body(0.5).map((p) => ({ ...p, visibility: 0.1 }));
    const s = x.ingest(
      merged(0, {
        pose: task("pose", 0, [pts]),
        face: task("face", 0, [], { blendshapes: [], matrices: [] }),
      }),
      1,
    );
    expect(s.pose).toBeNull();
    expect(s.face).toBeNull();
  });

  it("tracks hands by the model's label and leaves a new hand's speed unknown", () => {
    const x = new SignalExtractor();
    const first = x.ingest(
      merged(0, { hand: task("hand", 0, [palm(0.3)], undefined, ["Left"]) }),
      1,
    );
    expect(first.hand!.hands).toEqual([{ label: "Left", speed: NaN }]);
    const next = x.ingest(
      merged(100, {
        hand: task("hand", 100, [palm(0.4), palm(0.8)], undefined, [
          "Left",
          "Right",
        ]),
      }),
      1,
    );
    expect(next.hand!.hands[0].speed).toBeCloseTo(1, 9); // 0.1 in 0.1 s
    expect(next.hand!.hands[1].speed).toBeNaN();
  });

  it("an empty hand result is a result that saw no hand", () => {
    const x = new SignalExtractor();
    expect(x.ingest(merged(0, { hand: task("hand", 0, []) }), 1).hand).toEqual({
      t: 0,
      hands: [],
    });
  });

  it("does not take a speed across a gap or after reset", () => {
    const x = new SignalExtractor();
    x.ingest(merged(0, { pose: task("pose", 0, [body(0.5)]) }), 1);
    const late = x.ingest(
      merged(5000, { pose: task("pose", 5000, [body(0.9)]) }),
      1,
    );
    expect(late.pose!.motion).toBeNaN();
    x.reset();
    const after = x.ingest(
      merged(5100, { pose: task("pose", 5100, [body(0.5)]) }),
      1,
    );
    expect(after.pose!.motion).toBeNaN();
  });

  it("uses world landmarks for wrist speed in metres when present, never needs them", () => {
    const x = new SignalExtractor();
    const world = (wx: number): Point[] =>
      Array.from({ length: 33 }, () => ({
        x: wx,
        y: 0,
        z: 0,
        visibility: 0.9,
      }));
    x.ingest(
      merged(0, { pose: task("pose", 0, [body(0.5)], { world: [world(0)] }) }),
      1,
    );
    const s = x.ingest(
      merged(500, {
        pose: task("pose", 500, [body(0.5)], { world: [world(0.1)] }),
      }),
      1,
    );
    expect(s.pose!.worldSpeed).toBeCloseTo(0.2, 9);
    const bare = new SignalExtractor();
    bare.ingest(merged(0, { pose: task("pose", 0, [body(0.5)]) }), 1);
    expect(
      bare.ingest(merged(500, { pose: task("pose", 500, [body(0.5)]) }), 1)
        .pose!.worldSpeed,
    ).toBeNaN();
  });

  it("measures change in expression per second", () => {
    const x = new SignalExtractor();
    x.ingest(merged(0, { face: faceTask(0, 0, 0, 0) }), 1);
    const s = x.ingest(merged(500, { face: faceTask(500, 0, 0, 0.3) }), 1);
    // Smile moved 0.3 in 0.5 s; brow and jaw did not move: mean of (0.6, 0, 0).
    expect(s.face!.change).toBeCloseTo(0.2, 9);
  });
});
