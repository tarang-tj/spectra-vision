/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The 3D view on the stage: builds the points for the current depth result,
// keeps one WebGL renderer while the view is on show, and gives it back when
// the view or the mode goes away. It owns no loop and no timer: everything
// here runs inside the stage's own draw call or a pointer event.
import { stageHooks, type StagePointerEvent } from "../../stage/stage-hooks";
import { telemetry } from "../../telemetry/bus";
import { depthAt } from "../../vision/depth/affine-fit";
import { colorize } from "../../vision/depth/colormap";
import { orbitMatrix, type Orbit } from "../../vision/depth/orbit";
import {
  RELIEF_HEIGHT,
  unprojectMetric,
  unprojectRelief,
  type Cloud,
} from "../../vision/depth/unproject";
import type { Frame } from "../../vision/frame";
import type { DepthExtra } from "../../vision/types";
import { createCloudRenderer, type CloudRenderer } from "./depth-cloud";
import type { DepthScale } from "./depth-metric";
import { getDepthView, onDepthView, turnView } from "./depth-store";

/** Degrees turned per CSS pixel dragged. */
const DRAG_DEGREES = 0.35;
/** Metric points farther than this many times the marked floor's far edge
 * are left out: that far past the fitted span the depths are not to be trusted. */
export const FAR_CUTOFF = 4;
/** The relief is looked at with this vertical field of view. */
const RELIEF_FOV = (35 * Math.PI) / 180;
/** Longest side of the 3D view's own canvas, in device pixels. */
const MAX_SIDE = 1600;

type Loaded = {
  values: Float32Array;
  scale: DepthScale;
  count: number;
  orbit: Omit<Orbit, "yaw" | "pitch" | "aspect">;
};

let renderer: CloudRenderer | null = null,
  // Why there is no 3D view, shown on the stage; cleared by leaving the view.
  problem = "",
  loaded: Loaded | null = null,
  cleanups: (() => void)[] = [],
  drag: { id: number; x: number; y: number } | null = null,
  mirrored = false,
  scratch: HTMLCanvasElement | null = null;

/** Give back the renderer, its GL objects and the pointer handler. */
export function releaseCloud() {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  renderer?.dispose();
  renderer = null;
  loaded = null;
  drag = null;
}
/** True while the 3D view holds a WebGL renderer (tests). */
export const cloudHeld = () => renderer !== null;

// Leaving the 3D view releases it at once. One listener for the page's life.
onDepthView(() => {
  if (getDepthView().view === "cloud") return;
  problem = "";
  releaseCloud();
});

function onPointer(e: StagePointerEvent): boolean {
  if (e.type === "down") {
    if (!e.inside) return false;
    drag = { id: e.pointerId, x: e.canvas.x, y: e.canvas.y };
    return true;
  }
  if (!drag || e.pointerId !== drag.id) return false;
  if (e.type === "move") {
    // The near side of the scene follows the finger.
    turnView(
      (e.canvas.x - drag.x) * DRAG_DEGREES * (mirrored ? 1 : -1),
      (e.canvas.y - drag.y) * DRAG_DEGREES,
    );
    drag = { id: drag.id, x: e.canvas.x, y: e.canvas.y };
  } else drag = null;
  return true;
}

function ensure(): CloudRenderer | null {
  if (renderer?.lost()) {
    releaseCloud();
    problem =
      "The 3D view lost its WebGL context. Switch to the depth map and back to try again.";
  }
  if (renderer || problem) return renderer;
  try {
    renderer = createCloudRenderer();
  } catch (error) {
    console.warn("[spectra depth] the 3D view could not start:", error);
  }
  if (!renderer) {
    problem = "The 3D view needs WebGL2, which this browser did not give.";
    return null;
  }
  cleanups = [
    stageHooks.onPointer(onPointer),
    // A model of another kind has loaded: another mode is on the stage now.
    telemetry.on("model", (event) => {
      if (event.kind !== "depth") releaseCloud();
    }),
  ];
  return renderer;
}

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

function load(
  target: CloudRenderer,
  frame: Frame,
  extra: DepthExtra,
  scale: DepthScale,
) {
  const { values, width, height } = extra;
  let cloud: Cloud, orbit: Loaded["orbit"];
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
  target.setPoints(
    cloud.positions,
    colorsFor(frame, extra, cloud),
    cloud.count,
  );
  loaded = { values, scale, count: cloud.count, orbit };
}

/** Draw the 3D view over the picture's rectangle. Returns the number of
 * points drawn (0 when there is no view to draw). */
export function drawCloud(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  extra: DepthExtra,
  scale: DepthScale,
): number {
  const { rect } = frame,
    target = ensure();
  ctx.save();
  ctx.fillStyle = "#0b1114";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (!target) {
    ctx.fillStyle = "#eef7f3";
    ctx.font = "500 13px Inter Variable, sans-serif";
    ctx.fillText(problem, rect.x + 16, rect.y + 28, rect.w - 32);
    ctx.restore();
    return 0;
  }
  if (!loaded || loaded.values !== extra.values || loaded.scale !== scale)
    load(target, frame, extra, scale);
  const view = getDepthView(),
    shrink = Math.min(1, MAX_SIDE / (Math.max(rect.w, rect.h) * frame.dpr)),
    width = Math.max(1, Math.round(rect.w * frame.dpr * shrink)),
    height = Math.max(1, Math.round(rect.h * frame.dpr * shrink));
  mirrored = frame.mirror;
  target.draw(
    width,
    height,
    orbitMatrix({
      ...loaded!.orbit,
      yaw: view.yaw,
      pitch: view.pitch,
      aspect: rect.w / rect.h,
    }),
    // A little more than one map cell, so neighbours close up.
    Math.max(1, Math.ceil((1.6 * height) / extra.height)),
  );
  if (frame.mirror) {
    ctx.translate(frame.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(target.canvas, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return loaded!.count;
}
