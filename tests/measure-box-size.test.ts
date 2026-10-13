/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { boxEdges, boxGeometry, sampleBox } from "../src/measure/box-size";
import { IMAGE } from "./fixtures/depth-scene";
import {
  TRUE_CAMERA,
  outputFor,
  sceneMap,
  standingScene,
} from "./fixtures/object-scene";

// The pure half of measured objects against a scene with exact truth
// (tests/fixtures/object-scene.ts): which cells stand for a box, and the
// distance and box size that follow from a depth and a camera.
const flat = (p: { x: number; y: number }) => p;

/** A map that reads `inner` in the middle half of `box` and `outer` elsewhere. */
function twoValueMap(
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
  inner: number,
  outer: number,
) {
  const values = new Float32Array(width * height).fill(outer);
  let count = 0;
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const x = (col + 0.5) / width,
        y = (row + 0.5) / height;
      if (
        x >= box.x + box.w / 4 &&
        x <= box.x + (3 * box.w) / 4 &&
        y >= box.y + box.h / 4 &&
        y <= box.y + (3 * box.h) / 4
      ) {
        values[row * width + col] = inner;
        count++;
      }
    }
  return { map: { width, height, values, min: inner, max: outer }, count };
}

describe("which depth-map cells stand for a box", () => {
  const box = { x: 0.2, y: 0.25, w: 0.4, h: 0.5 };

  it("takes the middle half of the box in each direction, and nothing else", () => {
    const { map, count } = twoValueMap(100, 80, box, 5, 9),
      sample = sampleBox(map, box);
    expect(count).toBe(20 * 20);
    expect(sample.cells).toBe(count);
    expect(sample.median).toBe(5);
    expect(sample.low).toBe(5);
    expect(sample.high).toBe(5);
    expect([sample.cols, sample.rows]).toEqual([40, 40]);
    expect(sample.inside).toBe(true);
  });

  it("reads the median: a nearer third of the sample does not move it", () => {
    const { map } = twoValueMap(100, 80, box, 5, 9);
    // The top 30% of the middle half reads much nearer (a larger output).
    for (let row = 30; row < 36; row++)
      for (let col = 30; col < 50; col++) map.values[row * 100 + col] = 40;
    const sample = sampleBox(map, box);
    expect(sample.median).toBe(5);
    expect(sample.high).toBe(40);
  });

  it("says when the box reaches the bars round the picture", () => {
    const { map } = twoValueMap(100, 80, box, 5, 9),
      barred = { ...map, content: { x: 30, y: 0, width: 60, height: 80 } };
    expect(sampleBox(barred, box).inside).toBe(false);
    expect(sampleBox(barred, { ...box, x: 0.35 }).inside).toBe(true);
  });
});

describe("distance and box size from a depth and a camera", () => {
  const scene = standingScene(),
    { truth } = scene,
    map = sceneMap(320, 240),
    sample = sampleBox(map, scene.box),
    edges = boxEdges(scene.box, IMAGE.w, IMAGE.h, flat);

  it("reads the board's own depth from the middle of its box", () => {
    // 1 / depth = SCALE * output + SHIFT is the fixture's own rule.
    const depth = 1 / (2.4e-4 * sample.median + 6e-5);
    expect(Math.abs(depth / truth.depth - 1)).toBeLessThan(0.01);
    expect(sample.median).toBeCloseTo(outputFor(depth), 4);
  });

  it("hits the true distance and the true upright height with no noise", () => {
    const g = boxGeometry(TRUE_CAMERA, edges, truth.depth);
    expect(Math.abs(g.distance / truth.distance - 1)).toBeLessThan(0.02);
    expect(g.height).not.toBeNull();
    expect(Math.abs(g.height! / truth.height - 1)).toBeLessThan(0.02);
  });

  it("gives the box's width at that distance, over the board's by the keystone and no more", () => {
    const g = boxGeometry(TRUE_CAMERA, edges, truth.depth);
    // The board's top is nearer than its middle, so the box is as wide as
    // the top looks: the width across the view at the middle's depth is
    // over by the ratio of the two depths.
    expect(g.width / truth.width).toBeCloseTo(truth.depth / truth.topDepth, 2);
    expect(Math.abs(g.width / truth.width - 1)).toBeLessThanOrEqual(
      g.keystone! + 0.02,
    );
  });

  it("reports the change in scale between the top and the bottom of the box", () => {
    const g = boxGeometry(TRUE_CAMERA, edges, truth.depth),
      byHand = Math.abs(truth.topDepth - truth.bottomDepth) / (2 * truth.depth);
    expect(byHand).toBeGreaterThan(0.05);
    expect(Math.abs(g.keystone! / byHand - 1)).toBeLessThan(0.1);
  });

  it("gives no height when the camera looks straight down, and still a distance and a width", () => {
    // Up is toward the camera: every plumb line runs to the picture's centre.
    const down = { ...TRUE_CAMERA, r: [1, 0, 0, 0, -1, 0, 0, 0, -1] },
      at = (top: number, bottom: number) =>
        boxGeometry(
          down,
          {
            left: { x: 700, y: (top + bottom) / 2 },
            right: { x: 900, y: (top + bottom) / 2 },
            top: { x: 800, y: top },
            bottom: { x: 800, y: bottom },
            centre: { x: 800, y: (top + bottom) / 2 },
          },
          2000,
        );
    // The top edge lies on the row every plumb line vanishes at.
    const onRow = at(600, 900);
    expect(onRow.height).toBeNull();
    expect(onRow.keystone).toBeNull();
    expect(onRow.distance).toBeGreaterThan(2000);
    expect(onRow.width).toBeCloseTo((2000 * 200) / TRUE_CAMERA.f, 6);
    // The box straddles that row: one end of the line is behind the camera.
    expect(at(450, 750).height).toBeNull();
  });
});
