/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  angleDifference,
  headMatrix,
  headPose,
  jointAngle2D,
  jointAngle3D,
} from "../src/measure/angles";

const o = { x: 0, y: 0, z: 0 };

describe("joint angles", () => {
  it("measures a right angle, a straight line and a fold", () => {
    expect(jointAngle2D({ x: 1, y: 0 }, o, { x: 0, y: 1 })).toBeCloseTo(90, 10);
    expect(jointAngle2D({ x: 1, y: 0 }, o, { x: -2, y: 0 })).toBeCloseTo(
      180,
      10,
    );
    expect(jointAngle2D({ x: 1, y: 0 }, o, { x: 3, y: 0 })).toBeCloseTo(0, 6);
  });
  it("puts x on the height scale with the aspect ratio", () => {
    const a = { x: 0.5, y: 0 },
      c = { x: 0.5, y: 1 };
    expect(jointAngle2D(a, o, c)).toBeCloseTo(63.4349, 3);
    expect(jointAngle2D(a, o, c, 2)).toBeCloseTo(45, 10);
  });
  it("measures in 3D, and is NaN without depth", () => {
    expect(
      jointAngle3D({ x: 1, y: 0, z: 0 }, o, { x: 0, y: 0, z: 1 }),
    ).toBeCloseTo(90, 10);
    expect(
      jointAngle3D({ x: 1, y: 1, z: 1 }, o, { x: -1, y: -1, z: -1 }),
    ).toBeCloseTo(180, 6);
    expect(jointAngle3D({ x: 1, y: 0 }, o, { x: 0, y: 1, z: 1 })).toBeNaN();
  });
  it("is NaN for a zero-length limb", () => {
    expect(jointAngle2D(o, o, { x: 1, y: 0 })).toBeNaN();
  });
});

describe("angleDifference", () => {
  it("takes the short way round", () => {
    expect(angleDifference(350, 10)).toBe(-20);
    expect(angleDifference(10, 350)).toBe(20);
    expect(angleDifference(180, 0)).toBe(180);
    expect(angleDifference(-170, 170)).toBe(20);
  });
});

describe("headPose and headMatrix", () => {
  it("round-trip yaw, pitch and roll", () => {
    for (const [yaw, pitch, roll] of [
      [0, 0, 0],
      [25, -10, 5],
      [-40, 15, -20],
      [60, 30, 45],
    ]) {
      const pose = headPose(headMatrix(yaw, pitch, roll))!;
      expect(pose.yaw).toBeCloseTo(yaw, 8);
      expect(pose.pitch).toBeCloseTo(pitch, 8);
      expect(pose.roll).toBeCloseTo(roll, 8);
    }
  });
  it("turns toward the image right for positive yaw and up for positive pitch", () => {
    const right = headMatrix(30, 0, 0),
      up = headMatrix(0, 30, 0);
    expect(right[8]).toBeGreaterThan(0.4);
    expect(up[9]).toBeGreaterThan(0.4);
  });
  it("ignores a uniform scale", () => {
    const m = headMatrix(20, 10, -5).map((v, i) => (i % 4 === 3 ? v : v * 7));
    expect(headPose(m)!.yaw).toBeCloseTo(20, 8);
  });
  it("returns null for a malformed or empty matrix", () => {
    expect(headPose(undefined)).toBeNull();
    expect(headPose([1, 2, 3])).toBeNull();
    expect(headPose(new Array(16).fill(0))).toBeNull();
  });
});
