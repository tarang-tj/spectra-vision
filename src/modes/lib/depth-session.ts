/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The 3D view on the stage: keeps one WebGL renderer while the view is on show, and gives it back when
// the view or the mode goes away. It owns no loop and no timer: everything
// here runs inside the stage's own draw call or a pointer event.
import { stageHooks, type StagePointerEvent } from "../../stage/stage-hooks";
import { telemetry } from "../../telemetry/bus";
import { orbitMatrix } from "../../vision/depth/orbit";
import type { Frame } from "../../vision/frame";
import type { DepthExtra } from "../../vision/types";
import { createCloudRenderer, type CloudRenderer } from "./depth-cloud";
import type { DepthScale } from "./depth-metric";
import { buildPoints, type ViewBase } from "./depth-points";
import { getDepthView, onDepthView, turnView } from "./depth-store";

/** Degrees turned per CSS pixel dragged. */
const DRAG_DEGREES = 0.35;
/** Longest side of the 3D view's own canvas, in device pixels. */
const MAX_SIDE = 1600;

type Loaded = {
  values: Float32Array;
  scale: DepthScale;
  count: number;
  orbit: ViewBase;
};

let renderer: CloudRenderer | null = null,
  // Why there is no 3D view, shown on the stage; cleared by leaving the view.
  problem = "",
  loaded: Loaded | null = null,
  cleanups: (() => void)[] = [],
  drag: { id: number; x: number; y: number } | null = null,
  mirrored = false;

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
  if (!loaded || loaded.values !== extra.values || loaded.scale !== scale) {
    const points = buildPoints(frame, extra, scale);
    target.setPoints(points.positions, points.colors, points.count);
    loaded = {
      values: extra.values,
      scale,
      count: points.count,
      orbit: points.orbit,
    };
  }
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
