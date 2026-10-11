/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The first tap of an outline or path that lands on a handle. Nothing is part
// built then, so the press takes hold of the handle; if it lifts without
// travelling it is a tap, and a tap with Path or Area chosen is a point.
// Positions are CSS pixels on a canvas that draws 1920 source pixels 356 wide.
import { beforeEach, describe, expect, it } from "vitest";
import { endDrag, onRulerPointer } from "../src/panels/ruler/pointer";
import {
  bindSource,
  getState,
  resetRuler,
  setTool,
} from "../src/panels/ruler/store";
import { HIT_TOUCH, TAP_TRAVEL } from "../src/panels/ruler/tap";
import type { StagePointerEvent } from "../src/stage/stage-hooks";

type P = { x: number; y: number };
const W = 1920,
  H = 1440,
  SCALE = 356 / W;
function send(type: StagePointerEvent["type"], css: P, cancelled = false) {
  return onRulerPointer({
    type,
    point: { x: css.x / SCALE / W, y: css.y / SCALE / H },
    inside: true,
    source: { width: W, height: H },
    canvas: css,
    scale: SCALE,
    pointerId: 1,
    pointerType: "touch",
    cancelled,
  });
}
const tap = (css: P) => {
  send("down", css);
  send("up", css);
};
const css = (pts: readonly P[]) =>
  pts.map((p) => ({
    x: Math.round(p.x * SCALE * 10) / 10,
    y: Math.round(p.y * SCALE * 10) / 10,
  }));
const BOARD: P[] = [
    { x: 60, y: 60 },
    { x: 260, y: 60 },
    { x: 260, y: 180 },
    { x: 60, y: 180 },
  ],
  // 7 px from the board's second corner: inside the touch grab radius.
  BESIDE = { x: 267, y: 60 };

beforeEach(() => {
  endDrag();
  resetRuler();
  bindSource(1, W, H, SCALE);
  for (const c of BOARD) tap(c);
});

describe("the first tap of a shape, on a handle", () => {
  it("starts an outline where the finger was and leaves the handle alone", () => {
    expect(7).toBeLessThan(HIT_TOUCH);
    setTool("area");
    send("down", BESIDE);
    // While the finger is down it holds the corner: a drag would move it.
    expect(getState().grab).toEqual({
      handle: { kind: "corner", i: 1 },
      held: true,
    });
    send("up", BESIDE);
    expect(css(getState().shapes[0].pts)).toEqual([BESIDE]);
    expect(css(getState().corners)).toEqual(BOARD);
    // It made a point, so there is no "took hold and moved nothing" to say.
    expect(getState().grab).toBeNull();
  });

  it("keeps every tap of an outline that starts beside a reference corner", () => {
    setTool("area");
    const outline = [
      BESIDE,
      { x: 340, y: 60 },
      { x: 340, y: 200 },
      { x: 267, y: 200 },
    ];
    for (const p of outline) tap(p);
    expect(css(getState().shapes[0].pts)).toEqual(outline);
    expect(css(getState().corners)).toEqual(BOARD);
  });

  it("starts a path the same way", () => {
    setTool("path");
    tap(BESIDE);
    expect(getState().shapes).toHaveLength(1);
    expect(getState().shapes[0].kind).toBe("path");
    expect(css(getState().shapes[0].pts)).toEqual([BESIDE]);
  });

  it("still moves the handle when the press travels, and adds no point", () => {
    setTool("area");
    const to = { x: BESIDE.x + TAP_TRAVEL + 6, y: BESIDE.y + 3 };
    send("down", BESIDE);
    send("move", to);
    send("up", to);
    expect(getState().shapes).toHaveLength(0);
    expect(css(getState().corners)[1]).toEqual(to);
  });

  it("adds no point when the press is cancelled (the page scrolled)", () => {
    setTool("area");
    send("down", BESIDE);
    send("up", BESIDE, true);
    expect(getState().shapes).toHaveLength(0);
    expect(css(getState().corners)).toEqual(BOARD);
  });

  it("with Span chosen a tap on a handle still places nothing and says so", () => {
    tap(BESIDE);
    expect(getState().measures).toHaveLength(0);
    expect(getState().grab).toEqual({
      handle: { kind: "corner", i: 1 },
      held: false,
    });
  });
});
