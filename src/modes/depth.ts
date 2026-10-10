/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { testHooksEnabled } from "../test-hooks";
import type { DepthExtra, Source, TaskResult } from "../vision/types";
import DepthControls from "./lib/depth-controls";
import { drawLegend, drawMap, drawMarker, extremes } from "./lib/depth-map";
import { measuredDepth } from "./lib/depth-measured";
import { depthScale } from "./lib/depth-metric";
import { depthExtra, depthRows, legendOf } from "./lib/depth-readout";
import { cloudHeld, drawCloud } from "./lib/depth-session";
import { getDepthView } from "./lib/depth-store";
import { drawChip } from "./lib/hud";
import type { ModeDef } from "./types";

// The source on the stage, as last drawn. The session export is built when a
// result arrives, with no frame at hand, and needs it to tell a photo from a
// video.
let onStage: Source | null = null;
// The latest result drawn, for the browser tests' read-only probe.
let drawn: { task: TaskResult; extra: DepthExtra; points: number } | null =
  null;

/** `window.__spectraDepth`, only on a page opened with `?spectra-test`: the
 * size and range of the map on the stage, the delegate that produced it, a
 * value read at an image-normalized point, and whether the 3D view holds a
 * WebGL renderer. */
function exposeProbe() {
  if (typeof window === "undefined" || !testHooksEnabled()) return;
  Object.assign(window, {
    __spectraDepth: {
      last: () =>
        drawn && {
          width: drawn.extra.width,
          height: drawn.extra.height,
          min: drawn.extra.min,
          max: drawn.extra.max,
          delegate: drawn.task.delegate,
          latency: drawn.task.latency,
          points: drawn.points,
        },
      at: (x: number, y: number) =>
        drawn
          ? drawn.extra.values[
              Math.floor(y * drawn.extra.height) * drawn.extra.width +
                Math.floor(x * drawn.extra.width)
            ]
          : null,
      cloudHeld,
    },
  });
}
exposeProbe();

const depth: ModeDef = {
  id: "depth",
  label: "Depth map",
  short: "Depth",
  order: 80,
  task: {
    kind: "depth",
    model: "depth_anything_v2_small.onnx",
    // The side the picture is resized toward before the model sees it. The
    // CPU size is the largest that stayed near one second a frame on one
    // WebAssembly thread; the GPU size about half a second on WebGPU (both
    // measured on an Apple silicon laptop in low power mode).
    options: { size: { CPU: 196, GPU: 392 } },
    // GPU here is WebGPU. AUTO asks for it only where the page has a hardware
    // renderer; a browser without WebGPU then falls back to CPU and says so.
    delegate: "AUTO",
  },
  hint: "Depth from one camera. Yellow is near, purple is far. For metres, mark a reference and a patch of floor in the Ruler on a photo.",
  demo: {
    still: "demo/studio.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio",
  },
  controls: DepthControls,
  drawBase(ctx, frame) {
    onStage = frame.source;
    const task = frame.result?.tasks.depth,
      extra = depthExtra(task);
    if (!task || !extra) return;
    const scale = depthScale(extra, task.generation, frame.source),
      view = getDepthView();
    // Asked once a drawn frame, so the error bar's retakes get worked out
    // shortly after the Ruler's points stop changing (depth-measured.ts).
    if (scale.metric) measuredDepth(scale, extra.max);
    let points = 0;
    frame.emit("before", "depth", 0);
    if (view.view === "cloud") {
      points = drawCloud(ctx, frame, extra, scale);
      drawChip(
        ctx,
        frame,
        scale.metric
          ? "3D points in real units, from the Ruler's floor fit"
          : "Relief of relative depth. Not to scale.",
        frame.rect.x + 8,
        // Under the stage's source badge; the lower corners hold its buttons.
        frame.rect.y + 44,
        "#a4ffd9",
      );
    } else {
      drawMap(ctx, frame, extra, view.opacity);
      drawLegend(ctx, frame, legendOf(extra, scale));
      const selected = frame.settings.selected,
        ends = extremes(extra);
      if (selected === 1) drawMarker(ctx, frame, ends.near, "Nearest");
      if (selected === 2) drawMarker(ctx, frame, ends.far, "Farthest");
    }
    frame.emit("after", "depth", 0);
    drawn = { task, extra, points };
  },
  inspector(frame) {
    const task = frame.result?.tasks.depth,
      extra = depthExtra(task);
    if (!task || !extra) return [];
    return depthRows(
      task,
      extra,
      depthScale(extra, task.generation, frame.source),
    );
  },
  // Depth follows no separate things: the rows are readings, not objects.
  count: () => 0,
  // A summary of the map, never the map itself.
  exportFrame(result) {
    const task = result.tasks.depth,
      extra = depthExtra(task);
    if (!task || !extra) return {};
    const scale = depthScale(
      extra,
      task.generation,
      onStage?.generation === task.generation ? onStage : null,
    );
    return {
      depth: {
        width: extra.width,
        height: extra.height,
        min: extra.min,
        max: extra.max,
        delegate: task.delegate,
        metric: scale.metric,
        ...(scale.metric
          ? {
              // 1 / (depth in metres) = scale * value + shift.
              scale: scale.fit.a * 1000,
              shift: scale.fit.b * 1000,
              floorCells: scale.floorCells,
              residual: scale.fit.residual,
            }
          : {}),
      },
    };
  },
};
export default depth;
