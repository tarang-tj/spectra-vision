/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  FACE_CONTOURS,
  FACE_IRISES,
  FACE_POINTS,
  FACE_TESSELATION,
  IRIS_CENTERS,
} from "../src/modes/lib/face-topology";
import type { Edges } from "../src/modes/lib/face-topology";
import {
  faceMeters,
  headPose,
  meterText,
  poseText,
} from "../src/modes/lib/face-metrics";

type Connection = { start: number; end: number };
// Undirected, de-duplicated edge keys, so both sides compare as sets.
const fromPackage = (list: Connection[]) =>
  new Set(
    list
      .filter((c) => c.start !== c.end)
      .map((c) => `${Math.min(c.start, c.end)}-${Math.max(c.start, c.end)}`),
  );
const fromData = (edges: Edges) => {
  const keys: string[] = [];
  for (let i = 0; i < edges.length; i += 2)
    keys.push(`${edges[i]}-${edges[i + 1]}`);
  return keys;
};

describe("the bundled face topology", () => {
  it("is exactly the topology the installed MediaPipe package publishes", () => {
    const cases: [Edges, Connection[]][] = [
      [FACE_TESSELATION, FaceLandmarker.FACE_LANDMARKS_TESSELATION],
      [FACE_CONTOURS, FaceLandmarker.FACE_LANDMARKS_CONTOURS],
      [
        FACE_IRISES,
        [
          ...FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
          ...FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        ],
      ],
    ];
    for (const [edges, list] of cases) {
      const expected = fromPackage(list),
        actual = fromData(edges);
      expect(actual.length).toBe(expected.size);
      expect(new Set(actual)).toEqual(expected);
    }
  });
  it("only refers to landmarks the 478-point model outputs", () => {
    for (const edges of [FACE_TESSELATION, FACE_CONTOURS, FACE_IRISES])
      expect(Math.max(...edges)).toBeLessThan(FACE_POINTS);
    expect(FACE_TESSELATION.length % 2).toBe(0);
    expect(IRIS_CENTERS.every((i) => i < FACE_POINTS)).toBe(true);
  });
});

describe("expression meters", () => {
  it("reads the five expressions from blendshape scores", () => {
    const meters = faceMeters({
      mouthSmileLeft: 0.8,
      mouthSmileRight: 0.4,
      jawOpen: 0.25,
      browInnerUp: 0.1,
      browOuterUpLeft: 0.6,
      browOuterUpRight: 0.2,
      eyeBlinkLeft: 0.9,
      eyeBlinkRight: 0.05,
    });
    expect(meters.map((m) => m.label)).toEqual([
      "Smile",
      "Jaw open",
      "Brow raise",
      "Blink left",
      "Blink right",
    ]);
    const values = meters.map((m) => m.value);
    expect(values[0]).toBeCloseTo(0.6);
    expect(values[1]).toBeCloseTo(0.25);
    expect(values[2]).toBeCloseTo(0.4);
    expect(values[3]).toBeCloseTo(0.9);
    expect(values[4]).toBeCloseTo(0.05);
  });
  it("treats missing or broken scores as zero and never leaves 0..1", () => {
    const meters = faceMeters({ jawOpen: 7, eyeBlinkLeft: NaN });
    expect(meters.find((m) => m.id === "jaw")!.value).toBe(1);
    expect(meters.find((m) => m.id === "blink-left")!.value).toBe(0);
    expect(meters.find((m) => m.id === "smile")!.value).toBe(0);
  });
  it("renders a meter as cells plus a percentage", () => {
    expect(meterText(0)).toBe("▱▱▱▱▱▱▱▱ 0%");
    expect(meterText(0.5)).toBe("▰▰▰▰▱▱▱▱ 50%");
    expect(meterText(1)).toBe("▰▰▰▰▰▰▰▰ 100%");
    expect(meterText(NaN)).toBe("▱▱▱▱▱▱▱▱ 0%");
    expect(meterText(3)).toBe("▰▰▰▰▰▰▰▰ 100%");
  });
});

// Column-major 4x4 from a row-major 3x3 rotation, with an optional scale.
const matrix = (r: number[][], scale = 1) => [
  r[0][0] * scale,
  r[1][0] * scale,
  r[2][0] * scale,
  0,
  r[0][1] * scale,
  r[1][1] * scale,
  r[2][1] * scale,
  0,
  r[0][2] * scale,
  r[1][2] * scale,
  r[2][2] * scale,
  0,
  1,
  2,
  -30,
  1,
];
const rad = (d: number) => (d * Math.PI) / 180;
const aboutY = (d: number) => [
  [Math.cos(rad(d)), 0, Math.sin(rad(d))],
  [0, 1, 0],
  [-Math.sin(rad(d)), 0, Math.cos(rad(d))],
];
const aboutX = (d: number) => [
  [1, 0, 0],
  [0, Math.cos(rad(d)), -Math.sin(rad(d))],
  [0, Math.sin(rad(d)), Math.cos(rad(d))],
];
const aboutZ = (d: number) => [
  [Math.cos(rad(d)), -Math.sin(rad(d)), 0],
  [Math.sin(rad(d)), Math.cos(rad(d)), 0],
  [0, 0, 1],
];

describe("head pose from the facial transformation matrix", () => {
  it("is zero for a face looking straight at the camera", () => {
    const pose = headPose(matrix(aboutY(0)))!;
    expect(pose.yaw).toBeCloseTo(0);
    expect(pose.pitch).toBeCloseTo(0);
    expect(pose.roll).toBeCloseTo(0);
    expect(poseText(pose)).toBe("yaw 0° · pitch 0° · roll 0°");
  });
  it("recovers a pure yaw, pitch and roll, whatever the scale", () => {
    expect(headPose(matrix(aboutY(25), 3))!.yaw).toBeCloseTo(25);
    expect(headPose(matrix(aboutY(-40)))!.yaw).toBeCloseTo(-40);
    // Rotating about x by a negative angle lifts the forward axis: pitch up.
    expect(headPose(matrix(aboutX(-15)))!.pitch).toBeCloseTo(15);
    expect(headPose(matrix(aboutZ(10), 0.5))!.roll).toBeCloseTo(10);
    expect(headPose(matrix(aboutZ(10)))!.yaw).toBeCloseTo(0);
  });
  it("returns null for a missing or degenerate matrix", () => {
    expect(headPose(undefined)).toBeNull();
    expect(headPose([1, 2, 3])).toBeNull();
    expect(headPose(new Array(16).fill(0))).toBeNull();
  });
});
