/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The 3D view's points for one depth result: where each map cell goes, what
// colour it takes from the picture, and where the view starts from.
import { depthAt } from "../../vision/depth/affine-fit";
import { colorize } from "../../vision/depth/colormap";
import type { Orbit } from "../../vision/depth/orbit";
import {
  RELIEF_HEIGHT,
  unprojectMetric,
  unprojectRelief,
  type Cloud,
} from "../../vision/depth/unproject";
import type { Frame } from "../../vision/frame";
import type { DepthExtra } from "../../vision/types";
import type { DepthScale } from "./depth-metric";

/** Metric points farther than this many times the marked floor's far edge
 * are left out: that far past the fitted span the depths are not to be trusted. */
export const FAR_CUTOFF = 4;
/** The relief is looked at with this vertical field of view. */
const RELIEF_FOV = (35 * Math.PI) / 180;

/** Everything about the view except how far the user has turned it. */
export type ViewBase = Omit<Orbit, "yaw" | "pitch" | "aspect">;
export type Points = {
  positions: Float32Array;
  colors: Uint8Array;
  count: number;
  orbit: ViewBase;
};

let scratch: HTMLCanvasElement | null = null;

/** The picture's own colour for every point, read at the map's size. If the
 * picture cannot be read, the depth map's colours are used instead. */
function colorsFor(frame: Frame, extra: DepthExtra, cloud: Cloud): Uint8Array {
  const { width, height } = extra,
    out = new Uint8Array(cloud.count * 4);
  let pixels: Uint8ClampedArray;
  try {
    scratch ??= document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(frame.source!.element, 0, 0, width, height);
    pixels = ctx.getImageData(0, 0, width, height).data;
  } catch {
    pixels = colorize(
      extra.values,
      extra.min,
      extra.max,
      new Uint8ClampedArray(width * height * 4),
    );
  }
  for (let i = 0; i < cloud.count; i++) {
    const at = cloud.cells[i] * 4;
    out[i * 4] = pixels[at];
    out[i * 4 + 1] = pixels[at + 1];
    out[i * 4 + 2] = pixels[at + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The median depth of a cloud's points, from a sample of them. */
function middleDepth(cloud: Cloud): number {
  const step = Math.max(1, Math.floor(cloud.count / 2000)),
    depths: number[] = [];
  for (let i = 0; i < cloud.count; i += step)
    depths.push(cloud.positions[3 * i + 2]);
  depths.sort((a, b) => a - b);
  return depths.length ? depths[depths.length >> 1] : 1;
}

/** The points of a depth result, their colours and the view they are first
 * seen from: metric when the scale is, else a relief. */
export function buildPoints(
  frame: Frame,
  extra: DepthExtra,
  scale: DepthScale,
): Points {
  const { values, width, height } = extra;
  let cloud: Cloud, orbit: ViewBase;
  if (scale.metric) {
    const { camera, fit } = scale,
      source = scale.s.source!;
    cloud = unprojectMetric(
      values,
      width,
      height,
      {
        f: camera.f,
        cx: camera.cx,
        cy: camera.cy,
        width: source.w,
        height: source.h,
      },
      (output) => depthAt(fit, output),
      FAR_CUTOFF * fit.far,
      scale.flatten,
    );
    // Seen from where the camera stood: with no turn this is the photo. It
    // turns about the point on the camera's axis at the middle depth, so a
    // few far points do not carry the pivot away from the scene.
    const pivot: [number, number, number] = [0, 0, middleDepth(cloud)];
    orbit = {
      eye: [0, 0, 0],
      pivot,
      radius:
        cloud.radius +
        Math.hypot(
          cloud.centre[0],
          cloud.centre[1],
          cloud.centre[2] - pivot[2],
        ),
      fovY: 2 * Math.atan(source.h / 2 / camera.f),
    };
  } else {
    cloud = unprojectRelief(values, width, height, extra.min, extra.max);
    orbit = {
      eye: [0, 0, -1 / Math.tan(RELIEF_FOV / 2)],
      pivot: [0, 0, RELIEF_HEIGHT],
      radius: cloud.radius,
      fovY: RELIEF_FOV,
    };
  }
  return {
    positions: cloud.positions,
    colors: colorsFor(frame, extra, cloud),
    count: cloud.count,
    orbit,
  };
}
