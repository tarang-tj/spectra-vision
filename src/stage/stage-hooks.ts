/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a panel may ask of the stage without owning it: draw on the stage
// canvas (so Record and Screenshot capture it) and receive pointer input as
// image-normalized points. One module-level instance, handed to panels as
// `useStudio().stage`; its identity never changes, so it is safe in a
// dependency list.
import { unproject } from "../vision/geometry";
import type { Frame } from "../vision/frame";
import type { Point } from "../vision/types";

/** Drawn on the stage canvas after the mode and every effect, once per drawn
 * frame, in canvas CSS pixels (use `frame.project` and `frame.rect`). The
 * context is saved and restored around the call. It is also drawn while the
 * stage is paused. A throw is logged once and skipped; the stage keeps going. */
export type StageOverlay = (
  ctx: CanvasRenderingContext2D,
  frame: Frame,
) => void;

export type StagePointerEvent = {
  /** "up" also reports a cancelled gesture (`cancelled: true`). */
  type: "down" | "move" | "up";
  /** Position in the source image, 0..1 on both axes, mirror and letterbox
   * aware: the exact inverse of `frame.project`. Outside 0..1 over the bars. */
  point: Point;
  /** True when the pointer is over the image itself, not the letterbox bars. */
  inside: boolean;
  /** The source's size in pixels, so `point.x * source.width` is a pixel. */
  source: { width: number; height: number };
  /** Position in canvas CSS pixels, for hit radii and a loupe. */
  canvas: { x: number; y: number };
  /** Canvas CSS pixels per source pixel (1.5 screen pixels is `1.5 / scale`
   * source pixels). */
  scale: number;
  pointerId: number;
  pointerType: string;
  cancelled: boolean;
};
/** Return true to consume the event: later handlers do not see it and the
 * stage prevents the browser's default for it. Handlers run newest first. */
export type StagePointerHandler = (event: StagePointerEvent) => boolean | void;

/** The part of the hooks a panel sees. */
export type StageHooks = {
  /** Draw on the stage canvas. Returns the function that removes the overlay;
   * call it when the panel unmounts. */
  addOverlay(draw: StageOverlay): () => void;
  /** Receive pointer down, move and up over the stage. While at least one
   * handler is registered the canvas stops the browser from scrolling on touch
   * (`touch-action: none`). With none registered, the stage behaves as before. */
  onPointer(handler: StagePointerHandler): () => void;
};

export type StageHooksCore = StageHooks & {
  /** Called by the renderer each frame with the geometry it just drew. */
  track(frame: Frame | null, sourceWidth: number, sourceHeight: number): void;
  drawOverlays(ctx: CanvasRenderingContext2D, frame: Frame): void;
  /** Called by the stage component for a pointer event, with the position as
   * a fraction (0..1) of the canvas box; true if a handler consumed it. */
  dispatch(
    type: StagePointerEvent["type"],
    fx: number,
    fy: number,
    pointer: { id: number; type: string; cancelled?: boolean },
  ): boolean;
  hasPointerHandlers(): boolean;
  /** Notified when the number of pointer handlers changes from or to zero. */
  subscribe(listener: () => void): () => void;
};

export function createStageHooks(): StageHooksCore {
  const overlays = new Set<StageOverlay>(),
    handlers: StagePointerHandler[] = [],
    watchers = new Set<() => void>(),
    failed = new WeakSet<StageOverlay>();
  let frame: Frame | null = null,
    sw = 0,
    sh = 0;
  const announce = () => watchers.forEach((watch) => watch());
  return {
    addOverlay(draw) {
      overlays.add(draw);
      return () => {
        overlays.delete(draw);
      };
    },
    onPointer(handler) {
      handlers.push(handler);
      if (handlers.length === 1) announce();
      return () => {
        const at = handlers.indexOf(handler);
        if (at < 0) return;
        handlers.splice(at, 1);
        if (!handlers.length) announce();
      };
    },
    track(next, width, height) {
      frame = next;
      sw = width;
      sh = height;
    },
    drawOverlays(ctx, current) {
      for (const draw of [...overlays]) {
        ctx.save();
        try {
          draw(ctx, current);
        } catch (error) {
          // Logged once per overlay, not thirty times a second.
          if (!failed.has(draw))
            console.error("[spectra overlay] draw failed:", error);
          failed.add(draw);
        } finally {
          ctx.restore();
        }
      }
    },
    dispatch(type, fx, fy, pointer) {
      const g = frame;
      if (!handlers.length || !g || !(g.rect.w > 0) || !(g.rect.h > 0) || !sw)
        return false;
      // The canvas is drawn in CSS pixels of the stage box (frame.width).
      const x = fx * g.width,
        y = fy * g.height,
        point = unproject({ x, y }, g.rect, g.mirror),
        event: StagePointerEvent = {
          type,
          point,
          inside: point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1,
          source: { width: sw, height: sh },
          canvas: { x, y },
          scale: g.rect.w / sw,
          pointerId: pointer.id,
          pointerType: pointer.type,
          cancelled: !!pointer.cancelled,
        };
      for (let i = handlers.length - 1; i >= 0; i--) {
        try {
          if (handlers[i](event) === true) return true;
        } catch (error) {
          console.error("[spectra pointer] handler failed:", error);
        }
      }
      return false;
    },
    hasPointerHandlers: () => handlers.length > 0,
    subscribe(listener) {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
  };
}

/** The app's one instance. */
export const stageHooks = createStageHooks();
