/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createStageHooks } from "../src/stage/stage-hooks";
import type { StagePointerEvent } from "../src/stage/stage-hooks";
import { createFrame, updateFrame } from "../src/vision/frame";
import type { FrameData } from "../src/vision/frame";
import { fit, project, unproject } from "../src/vision/geometry";

afterEach(() => vi.restoreAllMocks());

describe("unproject", () => {
  const rect = fit(1280, 720, 400, 600); // letterboxed: bars above and below
  it("is the inverse of project, with and without mirror", () => {
    for (const mirror of [false, true])
      for (const p of [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0.25, y: 0.8 },
        { x: 0.5, y: 0.5 },
      ]) {
        const back = unproject(project(p, rect, mirror), rect, mirror);
        expect(back.x).toBeCloseTo(p.x, 12);
        expect(back.y).toBeCloseTo(p.y, 12);
      }
  });
  it("round-trips the other way too", () => {
    const canvas = { x: 123.5, y: 301.25 };
    for (const mirror of [false, true]) {
      const back = project(unproject(canvas, rect, mirror), rect, mirror);
      expect(back.x).toBeCloseTo(canvas.x, 9);
      expect(back.y).toBeCloseTo(canvas.y, 9);
    }
  });
  it("lands outside 0..1 over the letterbox bars", () => {
    expect(unproject({ x: 200, y: 5 }, rect).y).toBeLessThan(0);
    expect(unproject({ x: 200, y: 595 }, rect).y).toBeGreaterThan(1);
  });
});

function ready(width = 400, height = 600, mirror = false) {
  const hooks = createStageHooks(),
    frame = createFrame(),
    data: FrameData = {
      result: null,
      tracks: [],
      mirror,
      settings: { confidence: 0.5, selected: null, effects: {} },
      source: null,
      aspect: 1280 / 720,
    };
  updateFrame(frame, data, 1280, 720, width, height, 1, 0, 0, false, true);
  hooks.track(frame, 1280, 720);
  return { hooks, frame };
}
const who = { id: 7, type: "touch" };

describe("stage pointer hooks", () => {
  it("reports image-normalized points, the source size and the display scale", () => {
    const { hooks, frame } = ready(),
      seen: StagePointerEvent[] = [];
    hooks.onPointer((e) => {
      seen.push(e);
    });
    // The centre of the canvas is the centre of the image.
    hooks.dispatch("down", 0.5, 0.5, who);
    const e = seen[0];
    expect(e.type).toBe("down");
    expect(e.point.x).toBeCloseTo(0.5, 12);
    expect(e.point.y).toBeCloseTo(0.5, 12);
    expect(e.inside).toBe(true);
    expect(e.source).toEqual({ width: 1280, height: 720 });
    expect(e.canvas).toEqual({ x: 200, y: 300 });
    expect(e.scale).toBeCloseTo(frame.rect.w / 1280, 12);
    expect([e.pointerId, e.pointerType, e.cancelled]).toEqual([
      7,
      "touch",
      false,
    ]);
  });
  it("undoes the mirror and flags the letterbox bars", () => {
    const { hooks, frame } = ready(400, 600, true),
      seen: StagePointerEvent[] = [];
    hooks.onPointer((e) => {
      seen.push(e);
    });
    const p = { x: 0.2, y: 0.7 },
      at = frame.project(p);
    hooks.dispatch("move", at.x / 400, at.y / 600, who);
    expect(seen[0].point.x).toBeCloseTo(0.2, 12);
    expect(seen[0].point.y).toBeCloseTo(0.7, 12);
    hooks.dispatch("move", 0.5, 0.02, who);
    expect(seen[1].inside).toBe(false);
  });
  it("lets the newest handler consume an event before older ones", () => {
    const { hooks } = ready(),
      order: string[] = [];
    hooks.onPointer(() => void order.push("old"));
    hooks.onPointer(() => {
      order.push("new");
      return true;
    });
    expect(hooks.dispatch("down", 0.5, 0.5, who)).toBe(true);
    expect(order).toEqual(["new"]);
  });
  it("falls through to older handlers when the newest declines", () => {
    const { hooks } = ready(),
      order: string[] = [];
    hooks.onPointer(() => {
      order.push("old");
      return true;
    });
    hooks.onPointer(() => void order.push("new"));
    expect(hooks.dispatch("down", 0.5, 0.5, who)).toBe(true);
    expect(order).toEqual(["new", "old"]);
  });
  it("does nothing, and consumes nothing, with no handler or no source", () => {
    const { hooks } = ready();
    expect(hooks.hasPointerHandlers()).toBe(false);
    expect(hooks.dispatch("down", 0.5, 0.5, who)).toBe(false);
    hooks.onPointer(() => true);
    hooks.track(null, 0, 0);
    expect(hooks.dispatch("down", 0.5, 0.5, who)).toBe(false);
  });
  it("announces when the first handler arrives and the last one leaves", () => {
    const { hooks } = ready(),
      watcher = vi.fn();
    hooks.subscribe(watcher);
    const off1 = hooks.onPointer(() => {}),
      off2 = hooks.onPointer(() => {});
    expect(watcher).toHaveBeenCalledTimes(1);
    off1();
    off1();
    expect(watcher).toHaveBeenCalledTimes(1);
    off2();
    expect(watcher).toHaveBeenCalledTimes(2);
    expect(hooks.hasPointerHandlers()).toBe(false);
  });
  it("survives a handler that throws", () => {
    const { hooks } = ready(),
      log = vi.spyOn(console, "error").mockImplementation(() => {});
    hooks.onPointer(() => true);
    hooks.onPointer(() => {
      throw new Error("boom");
    });
    expect(hooks.dispatch("down", 0.5, 0.5, who)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("stage overlays", () => {
  const ctx = () =>
    ({
      save: vi.fn(),
      restore: vi.fn(),
    }) as unknown as CanvasRenderingContext2D & {
      save: ReturnType<typeof vi.fn>;
      restore: ReturnType<typeof vi.fn>;
    };
  it("draws every overlay with the frame, inside save and restore, until removed", () => {
    const { hooks, frame } = ready(),
      c = ctx(),
      draw = vi.fn(),
      off = hooks.addOverlay(draw);
    hooks.drawOverlays(c, frame);
    expect(draw).toHaveBeenCalledWith(c, frame);
    expect([c.save.mock.calls.length, c.restore.mock.calls.length]).toEqual([
      1, 1,
    ]);
    off();
    hooks.drawOverlays(c, frame);
    expect(draw).toHaveBeenCalledTimes(1);
  });
  it("logs a failing overlay once and keeps drawing the others", () => {
    const { hooks, frame } = ready(),
      c = ctx(),
      log = vi.spyOn(console, "error").mockImplementation(() => {}),
      good = vi.fn();
    hooks.addOverlay(() => {
      throw new Error("bad overlay");
    });
    hooks.addOverlay(good);
    hooks.drawOverlays(c, frame);
    hooks.drawOverlays(c, frame);
    expect(log).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(2);
    expect(c.restore.mock.calls.length).toBe(4);
  });
});
