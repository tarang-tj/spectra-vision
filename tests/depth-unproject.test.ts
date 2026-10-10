/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { orbitMatrix, viewPoint } from "../src/vision/depth/orbit";
import {
  cellCentre,
  RELIEF_HEIGHT,
  unprojectMetric,
  unprojectRelief,
} from "../src/vision/depth/unproject";
import {
  FOCAL,
  IMAGE,
  floorDepthTruth,
  heightTruth,
} from "./fixtures/depth-scene";

const CAMERA = {
    f: FOCAL,
    cx: IMAGE.w / 2,
    cy: IMAGE.h / 2,
    width: IMAGE.w,
    height: IMAGE.h,
  },
  W = 64,
  H = 48;

/** A map whose values are the true floor depths. */
function depthMap() {
  const values = new Float32Array(W * H);
  for (let row = 0; row < H; row++)
    for (let col = 0; col < W; col++) {
      const p = cellCentre(col, row, W, H, IMAGE.w, IMAGE.h);
      values[row * W + col] = floorDepthTruth(p.x, p.y) ?? 0;
    }
  return values;
}

describe("metric unprojection", () => {
  it("puts a depth map of a known floor on that floor", () => {
    const cloud = unprojectMetric(
      depthMap(),
      W,
      H,
      CAMERA,
      (depth) => (depth > 0 ? depth : null),
      Infinity,
    );
    // The horizon is above this picture, so every cell is floor.
    expect(cloud.count).toBe(W * H);
    for (let i = 0; i < cloud.count; i++) {
      const p = {
        x: cloud.positions[3 * i],
        y: cloud.positions[3 * i + 1],
        z: cloud.positions[3 * i + 2],
      };
      // Height above the floor, by the fixture's own geometry: zero, within
      // single precision at up to tens of metres.
      expect(Math.abs(heightTruth(p))).toBeLessThan(0.02 + p.z * 2e-6);
      // And the point is on the ray of the cell it came from.
      const cell = cloud.cells[i],
        centre = cellCentre(
          cell % W,
          Math.floor(cell / W),
          W,
          H,
          IMAGE.w,
          IMAGE.h,
        );
      expect(CAMERA.cx + (FOCAL * p.x) / p.z).toBeCloseTo(centre.x, 1);
      expect(CAMERA.cy + (FOCAL * p.y) / p.z).toBeCloseTo(centre.y, 1);
    }
  });

  it("leaves out cells with no depth and cells past the cutoff", () => {
    const values = depthMap(),
      near = unprojectMetric(values, W, H, CAMERA, (d) => d || null, 3000);
    expect(near.count).toBeGreaterThan(0);
    for (let i = 0; i < near.count; i++)
      expect(near.positions[3 * i + 2]).toBeLessThanOrEqual(3000);
    const none = unprojectMetric(values, W, H, CAMERA, () => null, Infinity);
    expect(none.count).toBe(0);
  });

  it("uses the flattened pixel when a lens correction is given", () => {
    const values = new Float32Array(W * H).fill(1000),
      shifted = unprojectMetric(
        values,
        W,
        H,
        CAMERA,
        (d) => d,
        Infinity,
        (p) => ({ x: p.x + 130, y: p.y }),
      ),
      plain = unprojectMetric(values, W, H, CAMERA, (d) => d, Infinity);
    // 130 px at f = 1300 and 1000 mm is 100 mm to the right.
    expect(shifted.positions[0] - plain.positions[0]).toBeCloseTo(100, 3);
    expect(shifted.positions[1]).toBeCloseTo(plain.positions[1], 6);
  });
});

describe("the relief of relative depth", () => {
  it("keeps the picture flat and raises the nearest value most", () => {
    const values = new Float32Array([5, 1, 3, 1, 1, 1]),
      cloud = unprojectRelief(values, 3, 2, 1, 5);
    expect(cloud.count).toBe(6);
    // x spans the aspect ratio, y spans -1 to 1, both at cell centres.
    expect(cloud.positions[0]).toBeCloseTo((-2 / 3) * 1.5, 6);
    expect(cloud.positions[1]).toBeCloseTo(-0.5, 6);
    // The largest value is nearest (z 0); the smallest is farthest.
    expect(cloud.positions[2]).toBe(0);
    expect(cloud.positions[5]).toBeCloseTo(2 * RELIEF_HEIGHT, 6);
    expect(cloud.positions[8]).toBeCloseTo(RELIEF_HEIGHT, 6);
  });
  it("is flat for a map with one value", () => {
    const cloud = unprojectRelief(new Float32Array(4).fill(2), 2, 2, 2, 2);
    expect([...cloud.positions].filter((_, i) => i % 3 === 2)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("the 3D view's matrix", () => {
  const orbit = {
    eye: [0, 0, 0] as const,
    pivot: [0, 0, 2000] as const,
    radius: 1500,
    yaw: 0,
    pitch: 0,
    fovY: 2 * Math.atan(IMAGE.h / 2 / FOCAL),
    aspect: IMAGE.w / IMAGE.h,
  };
  it("with no turn is the camera's own picture", () => {
    const m = orbitMatrix(orbit),
      // The point 2 m ahead on the ray of picture pixel (u, v).
      on = (u: number, v: number): [number, number, number] => [
        ((u - CAMERA.cx) / FOCAL) * 2000,
        ((v - CAMERA.cy) / FOCAL) * 2000,
        2000,
      ],
      centre = viewPoint(m, on(IMAGE.w / 2, IMAGE.h / 2)),
      topLeft = viewPoint(m, on(0, 0)),
      bottomRight = viewPoint(m, on(IMAGE.w, IMAGE.h));
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.y).toBeCloseTo(0, 6);
    expect(centre.w).toBeCloseTo(2000, 3);
    // Picture corners land on the view's corners; y is up in the view.
    expect(topLeft.x).toBeCloseTo(-1, 6);
    expect(topLeft.y).toBeCloseTo(1, 6);
    expect(bottomRight.x).toBeCloseTo(1, 6);
    expect(bottomRight.y).toBeCloseTo(-1, 6);
  });
  it("turns about the pivot: it stays put and near points move across", () => {
    const turned = orbitMatrix({ ...orbit, yaw: 30, pitch: 20 }),
      pivot = viewPoint(turned, [0, 0, 2000]);
    expect(pivot.x).toBeCloseTo(0, 6);
    expect(pivot.y).toBeCloseTo(0, 6);
    expect(pivot.w).toBeCloseTo(2000, 3);
    // A point nearer than the pivot goes left with a positive yaw and down
    // with a positive pitch.
    const sideways = viewPoint(
        orbitMatrix({ ...orbit, yaw: 30 }),
        [0, 0, 1200],
      ),
      tilted = viewPoint(orbitMatrix({ ...orbit, pitch: 20 }), [0, 0, 1200]);
    expect(sideways.x).toBeLessThan(-0.1);
    expect(sideways.y).toBeCloseTo(0, 6);
    expect(tilted.y).toBeLessThan(-0.05);
    expect(tilted.x).toBeCloseTo(0, 6);
  });
});
