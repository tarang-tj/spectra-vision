/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The picture a result was computed from. A slow model (Depth takes 0.3 to
// 1 s a frame) answers after a moving picture has moved on, and its output
// drawn over the live picture sits beside the thing it describes. A task that
// sets `holdFrame` gets the frame each result was made from on the result, so
// its mode can draw the two together. Two canvases are used in turn, so
// nothing is allocated per frame.

export type HeldFrame = {
  /** The frame the model was given, at no more than MAX_SIDE on a side. Only
   * the latest result's is valid: the one before it is drawn over next. */
  image: CanvasImageSource;
  /** `performance.now()` when the frame was read from the source: the same
   * clock as `Frame.time`. */
  capturedAt: number;
};

/** The held copy's longest side, in pixels. */
export const MAX_SIDE = 1280;

type Surface = {
  width: number;
  height: number;
  getContext(kind: "2d"): Pick<CanvasRenderingContext2D, "drawImage"> | null;
};

export type FrameHolder = {
  /** Copy the frame about to be sent to the model. */
  capture(
    frame: CanvasImageSource & { width: number; height: number },
    at: number,
  ): void;
  /** The result for the captured frame arrived: that frame, or null when
   * nothing was captured for it. */
  commit(): HeldFrame | null;
  /** The captured frame will get no result (the worker restarted). */
  drop(): void;
};

export function createFrameHolder(
  // Injectable so the turn-taking can be tested without a DOM.
  surface: () => Surface = () => document.createElement("canvas"),
): FrameHolder {
  // `spare` is drawn into next; `shown` belongs to the latest result.
  let spare: Surface | null = null,
    shown: Surface | null = null,
    pending: { surface: Surface; at: number } | null = null;
  return {
    capture(frame, at) {
      const target = pending?.surface ?? spare ?? surface(),
        shrink = Math.min(1, MAX_SIDE / Math.max(frame.width, frame.height)),
        width = Math.max(1, Math.round(frame.width * shrink)),
        height = Math.max(1, Math.round(frame.height * shrink));
      spare = null;
      pending = null;
      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
      }
      const ctx = target.getContext("2d");
      if (!ctx) {
        spare = target;
        return;
      }
      ctx.drawImage(frame, 0, 0, width, height);
      pending = { surface: target, at };
    },
    commit() {
      if (!pending) return null;
      spare = shown;
      shown = pending.surface;
      const held = {
        image: shown as unknown as CanvasImageSource,
        capturedAt: pending.at,
      };
      pending = null;
      return held;
    },
    drop() {
      if (!pending) return;
      spare = pending.surface;
      pending = null;
    },
  };
}
