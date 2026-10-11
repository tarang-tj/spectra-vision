/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import catalogue from "../../scripts/models.json";
import type { Source } from "../vision/types";
import DepthControls from "./lib/depth-controls";
import {
  drawHeld,
  drawLegend,
  drawMap,
  drawMarker,
  extremes,
} from "./lib/depth-map";
import { measuredDepth, onDepthReadout } from "./lib/depth-measured";
import { depthScale } from "./lib/depth-metric";
import { noteDrawn } from "./lib/depth-probe";
import { depthExtra, depthRows, legendOf } from "./lib/depth-readout";
import { drawCloud, releaseCloud } from "./lib/depth-session";
import { getDepthView } from "./lib/depth-store";
import { depthSync, isMoving, lagLine } from "./lib/depth-sync";
import { drawChip } from "./lib/hud";
import type { ModeDef } from "./types";

// The source on the stage, as last drawn. The session export is built when a
// result arrives, with no frame at hand, and needs it to tell a photo from a
// video.
let onStage: Source | null = null;
const MODEL = "depth_anything_v2_small.onnx";

const depth: ModeDef = {
  id: "depth",
  label: "Depth map",
  short: "Depth",
  order: 80,
  task: {
    kind: "depth",
    model: MODEL,
    // The side the picture is resized toward before the model sees it. The
    // CPU size is the largest that stayed near one second a frame on one
    // WebAssembly thread; the GPU size about half a second on WebGPU (both
    // measured on an Apple silicon laptop in low power mode).
    // `bytes` is the model's size from the manifest: the worker reads the
    // download into one buffer of that size instead of holding it twice.
    options: {
      size: { CPU: 196, GPU: 392 },
      bytes: catalogue.find((m) => m.file === MODEL)?.bytes,
    },
    // GPU here is WebGPU. AUTO asks for it only where the page has a hardware
    // renderer; a browser without WebGPU then falls back to CPU and says so.
    delegate: "AUTO",
    // A map takes long enough that a moving picture moves on: each result
    // carries the frame it was made from, and the map is drawn over that.
    holdFrame: true,
    // Nothing counts depth maps, so a still picture is inferred once. Its
    // metres follow the Ruler, and their error bars are worked out a moment
    // after the Ruler settles: either is shown without a new map.
    still: "once",
    restate: onDepthReadout,
  },
  hint: "Depth from one camera. Yellow is near, purple is far. For metres, mark a reference and a patch of floor in the Ruler on a photo.",
  demo: {
    still: "demo/studio.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio",
  },
  controls: DepthControls,
  // Another mode has the stage: the 3D view's WebGL objects and its pointer
  // handler go now, not when that mode's model has finished loading.
  leave: releaseCloud,
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
    // Over which picture: the live one, or the frame the map was made from.
    const sync = depthSync(task, frame, isMoving(frame)),
      lag = lagLine(sync);
    let points = 0;
    frame.emit("before", "depth", 0);
    if (view.view === "cloud") {
      points = drawCloud(
        ctx,
        frame,
        extra,
        scale,
        sync.over === "held" ? sync.image : frame.source!.element,
      );
      drawChip(
        ctx,
        frame,
        (scale.metric
          ? "3D points in real units, from the Ruler's floor fit"
          : "Relief of relative depth. Not to scale.") +
          (sync.over === "held" && lag ? ` ${lag}` : ""),
        frame.rect.x + 8,
        // Under the stage's source badge; the lower corners hold its buttons.
        frame.rect.y + 44,
        "#a4ffd9",
      );
    } else {
      // A map is drawn over the frame it was made from, or not at all. With
      // the map fully clear there is nothing to keep in step, so the live
      // picture shows.
      const drawn =
        sync.over === "live" || (sync.over === "held" && view.opacity > 0);
      if (drawn && sync.over === "held") drawHeld(ctx, frame, sync.image);
      if (drawn) drawMap(ctx, frame, extra, view.opacity);
      drawLegend(ctx, frame, {
        ...legendOf(extra, scale),
        ...(lag && (drawn || sync.over === "nothing") ? { lag } : {}),
      });
      const selected = frame.settings.selected,
        ends = extremes(extra);
      if (drawn && selected === 1) drawMarker(ctx, frame, ends.near, "Nearest");
      if (drawn && selected === 2) drawMarker(ctx, frame, ends.far, "Farthest");
    }
    frame.emit("after", "depth", 0);
    noteDrawn({ task, extra, points, over: sync.over, lag });
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
