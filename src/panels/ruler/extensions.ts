/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Ruler tools that live in their own folders, and the glue that hands
// them the stage. To add one: a folder whose index default-exports a
// RulerExtension, its tool id in state.ts, and one line in the list below.
import type { StagePointerEvent } from "../../stage/stage-hooks";
import type { Frame } from "../../vision/frame";
import { cameraOf } from "./camera-of";
import { derive, type Derived } from "./derive";
import type { ExtensionEnv, RulerExtension } from "./extension-types";
import fit from "./fit";
import type { Pt } from "./homography";
import { applyLens, invertLens } from "./lens";
import { getState, type RulerState, type Tool } from "./state";
import walls from "./walls";

export const EXTENSIONS: readonly RulerExtension[] = [fit, walls].filter(
  (e) => !e.stub,
);

export const extensionFor = (tool: Tool): RulerExtension | null =>
  EXTENSIONS.find((e) => e.tool === tool) ?? null;

export function extensionEnv(
  s: RulerState = getState(),
  d: Derived = derive(s),
): ExtensionEnv {
  return {
    s,
    d,
    camera: cameraOf(s, d),
    flat: (tap) => applyLens(d.lens, tap),
    unflat: (flat) => invertLens(d.lens, flat),
  };
}

/** Hand a pointer event to the chosen tool. */
export const extensionPointer = (
  ext: RulerExtension,
  e: StagePointerEvent,
): boolean => ext.pointer(e, extensionEnv());

const failed = new Set<string>();

/** Draw every extension over the Ruler's own drawing. `w` and `h` are the
 * source size in pixels. One that throws is logged once and skipped. */
export function drawExtensions(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  s: RulerState,
  d: Derived,
  w: number,
  h: number,
) {
  if (!EXTENSIONS.length) return;
  const base = extensionEnv(s, d),
    tapToCanvas = (p: Pt) => frame.project({ x: p.x / w, y: p.y / h }),
    env = {
      ...base,
      frame,
      tapToCanvas,
      toCanvas: (p: Pt) => tapToCanvas(base.unflat(p)),
    };
  for (const ext of EXTENSIONS) {
    ctx.save();
    try {
      ext.draw(ctx, env);
    } catch (error) {
      if (!failed.has(ext.tool)) {
        failed.add(ext.tool);
        console.error(`Ruler tool "${ext.tool}" failed to draw`, error);
      }
    }
    ctx.restore();
  }
}
