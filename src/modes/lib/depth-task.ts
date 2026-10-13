/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The one depth task. Depth runs it as its own model; Objects runs the same
// spec on demand to measure its boxes (object-measure.ts). Both load the same
// file at the same sizes under the same delegate rule.
import catalogue from "../../../scripts/models.json";
import type { TaskSpec } from "../../vision/types";
import { onDepthReadout } from "./depth-measured";

export const DEPTH_MODEL = "depth_anything_v2_small.onnx";

export const depthTask: TaskSpec = {
  kind: "depth",
  model: DEPTH_MODEL,
  // The side the picture is resized toward before the model sees it. The
  // CPU size is the largest that stayed near one second a frame on one
  // WebAssembly thread; the GPU size about half a second on WebGPU (both
  // measured on an Apple silicon laptop in low power mode).
  // `bytes` is the model's size from the manifest: the worker reads the
  // download into one buffer of that size instead of holding it twice.
  options: {
    size: { CPU: 196, GPU: 392 },
    bytes: catalogue.find((m) => m.file === DEPTH_MODEL)?.bytes,
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
};
