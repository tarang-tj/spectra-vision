/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The error bars of a measured box (box-size.ts). Each bar is its terms
// added in quadrature as independent, with every standard deviation stated
// as two. The spread of depths inside the box is the one exception: it goes
// in whole, as one standard deviation of the box's cells, which is already
// wider than the error of their median. What no term covers is said in the words that go with the number
// (modes/lib/object-measure-text.ts): how loosely the box sits round the
// object, and lens distortion that was not corrected. Pure.
import { depthAt } from "../vision/depth/affine-fit";
import {
  OFF_FLOOR_ALLOWANCE,
  boxGeometry,
  type BoxEdges,
  type BoxGeometry,
} from "./box-size";
import type { Camera } from "./camera";
import { combineErrors } from "./noise";
import { sampleSd } from "./series";

type View = Pick<Camera, "f" | "cx" | "cy" | "r">;
/** One simulated retake of the Ruler's taps: the fit and the camera it gave. */
export type RetakeView = { a: number; b: number; camera: View };

/** What a bar is made of, each in the unit of its value. */
export type BarTerms = {
  /** 2 standard deviations over the retakes of the Ruler's taps. */
  taps: number;
  /** Twice the scatter the fit left on the marked floor. */
  scatter: number;
  /** The spread of depths inside the sample. */
  spread: number;
  /** The allowance for the depth model away from the floor. */
  allowance: number;
  /** One cell of the detector's input on each edge (sizes only). */
  edges?: number;
  /** The change in scale between top and bottom (width only). */
  keystone?: number;
};
export type Barred = { value: number; error: number; terms: BarTerms };
export type BoxBars = {
  /** Retakes whose fit could place the depth. */
  placed: number;
  distance: Barred;
  width: Barred;
  /** Null when the plumb line does not show, here or in too many retakes. */
  height: Barred | null;
  /** The share of the width the keystone term stands for. */
  keystone: number;
};

/** A height most retakes cannot give has no bar worth stating. */
const MIN_SHARE = 0.8;

export function boxBars(input: {
  camera: View;
  edges: BoxEdges;
  /** The fit's depth at `output`, along the camera's axis. */
  z: number;
  /** The model's median output over the box's sample. */
  output: number;
  retakes: readonly RetakeView[];
  /** The fit's scatter on the marked floor, as a share of depth. */
  residual: number;
  /** The sample's spread in depth, as a share of its median depth. */
  spread: number;
  /** One cell of the detector's input, in source pixels. */
  cell: { w: number; h: number };
}): BoxBars {
  const { camera, edges, z, retakes, residual, spread, cell } = input,
    nominal = boxGeometry(camera, edges, z),
    trials: BoxGeometry[] = [];
  // Focal length and depth move together in a retake, so each quantity is
  // worked out again under the retake's own fit and camera.
  for (const retake of retakes) {
    const depth = depthAt(retake, input.output);
    if (depth !== null) trials.push(boxGeometry(retake.camera, edges, depth));
  }
  const heights = trials.flatMap((t) => (t.height === null ? [] : [t.height])),
    keystone = nominal.keystone ?? spread,
    bar = (
      value: number,
      seen: number[],
      own: Pick<BarTerms, "edges" | "keystone">,
    ): Barred => {
      const terms: BarTerms = {
        taps: 2 * sampleSd(seen),
        scatter: 2 * residual * value,
        spread: spread * value,
        allowance: OFF_FLOOR_ALLOWANCE * value,
        ...own,
      };
      return { value, error: combineErrors(...Object.values(terms)), terms };
    },
    edge = (size: number) => (Math.SQRT2 * size * z) / camera.f;
  return {
    placed: trials.length,
    distance: bar(
      nominal.distance,
      trials.map((t) => t.distance),
      {},
    ),
    width: bar(
      nominal.width,
      trials.map((t) => t.width),
      { edges: edge(cell.w), keystone: keystone * nominal.width },
    ),
    height:
      nominal.height !== null && heights.length >= MIN_SHARE * retakes.length
        ? bar(nominal.height, heights, { edges: edge(cell.h) })
        : null,
    keystone,
  };
}
