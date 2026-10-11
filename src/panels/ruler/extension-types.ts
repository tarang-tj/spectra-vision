/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The contract for a Ruler tool that lives in its own folder (see
// extensions.ts). Types only, so a tool can import this file freely.
import type { ComponentType } from "react";
import type { Camera } from "../../measure/camera";
import type { StagePointerEvent } from "../../stage/stage-hooks";
import type { Frame } from "../../vision/frame";
import type { Derived } from "./derive";
import type { Pt } from "./homography";
import type { ExtensionTool, RulerState } from "./state";

/** Two kinds of picture point are in play. A *tap* is where a finger landed,
 * in source pixels. A *flat* point is the same place after the optional lens
 * correction: the plane map (`d.sheet.h`) and the camera work in flat points.
 * With no lens correction the two are equal. */
export type ExtensionEnv = {
  s: RulerState;
  d: Derived;
  /** The camera recovered from the reference and any plumb edges; null until
   * the reference is solved. Check `camera.focalResolved` before showing a
   * height. */
  camera: Camera | null;
  /** Tap to flat. */
  flat(tap: Pt): Pt;
  /** Flat to tap. */
  unflat(flat: Pt): Pt;
};
export type DrawEnv = ExtensionEnv & {
  frame: Frame;
  /** A tap (source pixels) to canvas CSS pixels, mirror and letterbox aware. */
  tapToCanvas(tap: Pt): { x: number; y: number };
  /** A flat point to canvas CSS pixels. */
  toCanvas(flat: Pt): { x: number; y: number };
};

export type RulerExtension = {
  tool: ExtensionTool;
  /** Tool button text and its tooltip. */
  label: string;
  hint: string;
  /** The one-line instruction shown while this tool is chosen. */
  step(env: ExtensionEnv): string;
  /** Called for every still frame after the Ruler's own drawing, whichever
   * tool is chosen, so what the tool placed stays on the picture. Context
   * state is saved and restored around it. Never called on a moving picture. */
  draw(ctx: CanvasRenderingContext2D, env: DrawEnv): void;
  /** Stage pointer events while this tool is chosen and the picture is still.
   * Return true to consume the event. An unconsumed press may still grab one
   * of the Ruler's own handles, so the reference stays adjustable. */
  pointer(e: StagePointerEvent, env: ExtensionEnv): boolean;
  /** The Undo button while this tool is chosen. */
  undo(): void;
  /** Rendered in the Ruler panel under its results. `show` is false while
   * the picture moves or belongs to another source: show no numbers then. */
  Section: ComponentType<{ show: boolean }>;
  /** A placeholder that is not offered to the user. */
  stub?: true;
};
