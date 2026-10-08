import { fit, project } from "./geometry";
import type { Point, Source, TaskKind, Track, VisionResult } from "./types";

/** User settings that drawing code may read. `effects` maps effect id to on/off. */
export type FrameSettings = {
  confidence: number;
  selected: number | null;
  effects: Readonly<Record<string, boolean>>;
};
/** The part of the frame state that does not depend on the canvas. The
 * inspector and panels receive this; the stage extends it into a full Frame. */
export type FrameData = {
  result: VisionResult | null;
  tracks: Track[];
  mirror: boolean;
  settings: FrameSettings;
  source: Source | null;
  /** Source width / height, used for aspect-correct distances (pinch). */
  aspect: number;
};
export type Rect = { x: number; y: number; w: number; h: number };
/** Where in a mode's base drawing an effect may interleave: just before or
 * just after one tracked item (a track, a body, a hand). */
export type FrameSlot = "before" | "after";
/** Everything a mode or effect needs to draw one frame. The stage owns a
 * single Frame and mutates it in place each frame, so never keep a reference to
 * one across frames and never rely on its identity changing. */
export type Frame = FrameData & {
  /** requestAnimationFrame timestamp of this frame, in ms. */
  time: number;
  /** Ms since the previous drawn frame; 0 on the first frame and while paused. */
  dt: number;
  paused: boolean;
  /** False while paused or when the user asked for reduced motion. Decorative
   * animation must hold still when this is false. */
  animate: boolean;
  /** Canvas size in CSS pixels. Drawing coordinates use these units. */
  width: number;
  height: number;
  /** Backing-store pixels per CSS pixel. */
  dpr: number;
  /** Letterboxed rectangle of the source image inside the canvas. */
  rect: Rect;
  /** Image-normalized point (0..1) to canvas CSS pixels, mirror aware. */
  project(point: Point): { x: number; y: number };
  /** Called by a mode around each item it draws so that active effects can
   * layer between items exactly where v1 drew them. */
  emit(slot: FrameSlot, kind: TaskKind, index: number): void;
};

const NO_SETTINGS: FrameSettings = {
  confidence: 0,
  selected: null,
  effects: {},
};

export function createFrame(emit: Frame["emit"] = () => {}): Frame {
  const rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  const frame: Frame = {
    result: null,
    tracks: [],
    mirror: false,
    settings: NO_SETTINGS,
    source: null,
    aspect: 1,
    time: 0,
    dt: 0,
    paused: false,
    animate: true,
    width: 0,
    height: 0,
    dpr: 1,
    rect,
    project: (point) => project(point, rect, frame.mirror),
    emit,
  };
  return frame;
}

/** Copy this frame's inputs into the shared Frame without allocating. */
export function updateFrame(
  frame: Frame,
  data: FrameData,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  dpr: number,
  time: number,
  dt: number,
  paused: boolean,
  animate: boolean,
) {
  frame.result = data.result;
  frame.tracks = data.tracks;
  frame.mirror = data.mirror;
  frame.settings = data.settings;
  frame.source = data.source;
  frame.aspect = data.aspect;
  frame.time = time;
  frame.dt = dt;
  frame.paused = paused;
  frame.animate = animate;
  frame.width = width;
  frame.height = height;
  frame.dpr = dpr;
  fit(sourceWidth, sourceHeight, width, height, frame.rect);
}
