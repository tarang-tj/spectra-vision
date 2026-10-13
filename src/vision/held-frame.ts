/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The picture a result was computed from. A slow model (Depth takes 0.3 to
// 1 s a frame) answers after a moving picture has moved on, and its output
// drawn over the live picture sits beside the thing it describes. A task that
// sets `holdFrame` gets the frame each result was made from on the result, so
// its mode can draw the two together. A canvas that went out with a result is
// drawn into again only after the page has rendered a later result (`settle`),
// so the stage never draws one result's map over another frame's picture. Two
// canvases serve a page that keeps up, and nothing is allocated per frame.

export type HeldFrame = {
  /** The frame the model was given, at no more than MAX_SIDE on a side. It
   * stays whole until the page has rendered a later result. */
  image: CanvasImageSource;
  /** `performance.now()` when the frame was read from the source: the same
   * clock as `Frame.time`. */
  capturedAt: number;
};

/** The held copy's longest side, in pixels. */
export const MAX_SIDE = 1280;
/** The most canvases handed out at one time: the latest result's, the one the
 * page shows, the one being filled and one for an effect that runs late. At
 * MAX_SIDE by 720 that is 4 x 1280 x 720 x 4 = 14,745,600 bytes. */
export const MAX_HELD = 4;

type Surface = {
  width: number;
  height: number;
  getContext(kind: "2d"): Pick<CanvasRenderingContext2D, "drawImage"> | null;
};

export type FrameHolder = {
  /** Copy the frame about to be sent to the model. Nothing is copied when
   * every canvas is still out: that result then carries no frame. */
  capture(
    frame: CanvasImageSource & { width: number; height: number },
    at: number,
  ): void;
  /** The result for the captured frame arrived: that frame, or null when
   * nothing was captured for it. */
  commit(): HeldFrame | null;
  /** The page has rendered the result holding `image` (null: one that holds
   * none). Every picture handed out, bar that one and the latest, can be
   * drawn into again. */
  settle(image: CanvasImageSource | null): void;
  /** The captured frame will get no result (the worker restarted). */
  drop(): void;
};

export function createFrameHolder(
  // Injectable so the turn-taking can be tested without a DOM.
  surface: () => Surface = () => document.createElement("canvas"),
): FrameHolder {
  // `free` can be drawn into; `out` went out with a result, oldest first.
  const free: Surface[] = [],
    out: Surface[] = [];
  let pending: { surface: Surface; at: number } | null = null;
  return {
    capture(frame, at) {
      const target =
        pending?.surface ??
        free.pop() ??
        (out.length < MAX_HELD ? surface() : null);
      pending = null;
      if (!target) return;
      const shrink = Math.min(
          1,
          MAX_SIDE / Math.max(frame.width, frame.height),
        ),
        width = Math.max(1, Math.round(frame.width * shrink)),
        height = Math.max(1, Math.round(frame.height * shrink));
      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
      }
      const ctx = target.getContext("2d");
      if (!ctx) {
        free.push(target);
        return;
      }
      ctx.drawImage(frame, 0, 0, width, height);
      pending = { surface: target, at };
    },
    commit() {
      if (!pending) return null;
      out.push(pending.surface);
      const held = {
        image: pending.surface as unknown as CanvasImageSource,
        capturedAt: pending.at,
      };
      pending = null;
      return held;
    },
    settle(image) {
      for (let i = out.length - 2; i >= 0; i--)
        if (out[i] !== (image as unknown)) free.push(...out.splice(i, 1));
    },
    drop() {
      if (!pending) return;
      free.push(pending.surface);
      pending = null;
    },
  };
}
