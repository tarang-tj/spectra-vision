/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// When a press places a point and when it grabs a handle. The picture is the
// audit's phone case: 1920 source pixels drawn 356 CSS pixels wide, with a US
// Letter sheet that is 40 by 21 CSS pixels. Positions below are CSS pixels on
// the canvas; the helper turns them into the event the stage would send.
import { beforeEach, describe, it, expect } from "vitest";
import { endDrag, onRulerPointer } from "../src/panels/ruler/pointer";
import { addReference } from "../src/panels/ruler/store-known";
import {
  bindSource,
  building,
  finishShape,
  getState,
  handleName,
  hit,
  resetRuler,
  setTool,
} from "../src/panels/ruler/store";
import {
  FLOOR_TOUCH,
  grabRadius,
  HIT_MOUSE,
  HIT_TOUCH,
  SPACING_SHARE,
  TAP_TRAVEL,
} from "../src/panels/ruler/tap";
import type { StagePointerEvent } from "../src/stage/stage-hooks";

type P = { x: number; y: number };
const W = 1920,
  H = 1440,
  SCALE = 356 / W,
  src = (p: P): P => ({ x: p.x / SCALE, y: p.y / SCALE });

function send(
  type: StagePointerEvent["type"],
  css: P,
  pointerType = "touch",
  pointerId = 1,
) {
  const p = src(css);
  return onRulerPointer({
    type,
    point: { x: p.x / W, y: p.y / H },
    inside: true,
    source: { width: W, height: H },
    canvas: css,
    scale: SCALE,
    pointerId,
    pointerType,
    cancelled: false,
  });
}
const tap = (css: P, pointerType = "touch") => {
  send("down", css, pointerType);
  send("up", css, pointerType);
};
/** The state's points, back in CSS pixels, rounded. */
const css = (pts: readonly P[]) =>
  pts.map((p) => ({
    x: Math.round(p.x * SCALE * 10) / 10,
    y: Math.round(p.y * SCALE * 10) / 10,
  }));

/** A sheet 40 by 21 CSS pixels, and a board 200 by 120. */
const SHEET: P[] = [
    { x: 150, y: 100 },
    { x: 190, y: 100 },
    { x: 190, y: 121 },
    { x: 150, y: 121 },
  ],
  BOARD: P[] = [
    { x: 60, y: 60 },
    { x: 260, y: 60 },
    { x: 260, y: 180 },
    { x: 60, y: 180 },
  ];

beforeEach(() => {
  endDrag();
  resetRuler();
  bindSource(1, W, H, SCALE);
});

describe("a press while something is part built places a point", () => {
  it("places all four corners of a sheet 40 by 21 px by touch, then a span", () => {
    // Corner 3 is 21 px from corner 2, inside the 24 px touch radius.
    expect(21).toBeLessThan(HIT_TOUCH);
    for (const c of SHEET) tap(c);
    expect(css(getState().corners)).toEqual(SHEET);
    expect(building(getState())).toBe(false);
    tap({ x: 80, y: 200 });
    // The second end goes 10 px from the first: still placed, not a grab.
    expect(building(getState())).toBe(true);
    tap({ x: 90, y: 200 });
    expect(css([getState().measures[0].a, getState().measures[0].b!])).toEqual([
      { x: 80, y: 200 },
      { x: 90, y: 200 },
    ]);
  });

  it("places outline points 7 px from reference corners and leaves the reference", () => {
    for (const c of BOARD) tap(c);
    setTool("area");
    const outline = [
      { x: 30, y: 30 },
      { x: 265, y: 55 },
      { x: 265, y: 185 },
      { x: 30, y: 230 },
    ];
    for (const p of outline) tap(p);
    expect(css(getState().corners)).toEqual(BOARD);
    expect(css(getState().shapes[0].pts)).toEqual(outline);
    expect(getState().grab).toBeNull();
  });

  it("places a further reference on the corners of an existing outline", () => {
    for (const c of BOARD) tap(c, "mouse");
    setTool("area");
    const rug = [
      { x: 40, y: 200 },
      { x: 140, y: 200 },
      { x: 140, y: 250 },
      { x: 40, y: 250 },
    ];
    for (const p of rug) tap(p, "mouse");
    finishShape();
    addReference({ id: "rug", label: "Rug", long: 2000, short: 1000 });
    for (const p of rug) tap(p, "mouse");
    expect(css(getState().extraRefs[0].corners)).toEqual(rug);
    expect(css(getState().shapes[0].pts)).toEqual(rug);
  });
});

describe("the grab radius", () => {
  it("is capped at 0.4 of the spacing to the nearest other handle, with a floor", () => {
    expect(SPACING_SHARE).toBe(0.4);
    expect(grabRadius(24, 8, 1000)).toBe(24);
    expect(grabRadius(24, 8, 21)).toBeCloseTo(8.4, 10);
    expect(grabRadius(24, 8, 3)).toBe(8);
    expect(grabRadius(24, 8, Infinity)).toBe(24);
  });

  it("leaves the space beside a small sheet free for a new point", () => {
    for (const c of SHEET) tap(c);
    const radius = HIT_TOUCH / SCALE,
      floor = FLOOR_TOUCH / SCALE;
    // 0.4 of the 21 px short side is 8.4 px.
    expect(hit(src({ x: 190 + 8, y: 100 }), radius, floor)).toEqual({
      kind: "corner",
      i: 1,
    });
    expect(hit(src({ x: 190 + 10, y: 100 }), radius, floor)).toBeNull();
    // A span end 10 px outside a corner is a new point.
    tap({ x: 200, y: 100 });
    expect(getState().measures).toHaveLength(1);
    expect(css(getState().corners)).toEqual(SHEET);
  });

  it("is the full radius for a handle with room round it", () => {
    for (const c of BOARD) tap(c);
    const at = src({ x: 60 + 20, y: 60 });
    expect(hit(at, HIT_TOUCH / SCALE, FLOOR_TOUCH / SCALE)).toEqual({
      kind: "corner",
      i: 0,
    });
    expect(hit(at, HIT_MOUSE / SCALE, 5 / SCALE)).toBeNull();
  });

  it("keeps two handles 4 px apart grabbable, the nearer one winning", () => {
    for (const c of BOARD) tap(c);
    tap({ x: 150, y: 220 });
    tap({ x: 154, y: 220 });
    const reach = [HIT_TOUCH / SCALE, FLOOR_TOUCH / SCALE] as const;
    expect(hit(src({ x: 149, y: 220 }), ...reach)).toEqual({
      kind: "end",
      m: 0,
      end: "a",
    });
    expect(hit(src({ x: 156, y: 220 }), ...reach)).toEqual({
      kind: "end",
      m: 0,
      end: "b",
    });
  });
});

describe("a press that grabbed a handle", () => {
  beforeEach(() => {
    for (const c of BOARD) tap(c);
  });

  it("does not move it when the press travels under 4 px", () => {
    expect(TAP_TRAVEL).toBe(4);
    const near = { x: 260 + 9, y: 60 - 6 };
    send("down", near);
    send("move", { x: near.x + 2, y: near.y + 2 });
    send("up", { x: near.x + 2.5, y: near.y + 2.5 });
    expect(css(getState().corners)).toEqual(BOARD);
    expect(getState().measures).toHaveLength(0);
  });

  it("moves it once the press has travelled 4 px", () => {
    const near = { x: 260 + 9, y: 60 - 6 };
    send("down", near);
    send("move", { x: near.x + 4, y: near.y });
    expect(css(getState().corners)[1]).toEqual({ x: near.x + 4, y: near.y });
    send("up", { x: near.x + 30, y: near.y + 10 });
    expect(css(getState().corners)[1]).toEqual({
      x: near.x + 30,
      y: near.y + 10,
    });
  });

  it("says which handle is held, and keeps saying it after a tap that moved nothing", () => {
    send("down", { x: 262, y: 62 });
    expect(getState().grab).toEqual({
      handle: { kind: "corner", i: 1 },
      held: true,
    });
    expect(handleName(getState().grab!.handle, getState())).toBe(
      "corner 2 of the reference",
    );
    send("up", { x: 262, y: 62 });
    expect(getState().grab).toEqual({
      handle: { kind: "corner", i: 1 },
      held: false,
    });
    // The next point placed ends the note.
    tap({ x: 150, y: 220 });
    expect(getState().grab).toBeNull();
    expect(getState().measures).toHaveLength(1);
  });

  it("says nothing after a real drag, or after a press that placed a point", () => {
    send("down", { x: 262, y: 62 });
    send("move", { x: 280, y: 70 });
    send("up", { x: 280, y: 70 });
    expect(getState().grab).toBeNull();
    send("down", { x: 150, y: 220 });
    expect(getState().grab).toBeNull();
    send("up", { x: 150, y: 220 });
    expect(getState().grab).toBeNull();
  });

  it("still drags a point with the press that placed it, from the first pixel", () => {
    send("down", { x: 150, y: 220 });
    send("move", { x: 151, y: 221 });
    expect(css([getState().measures[0].a])).toEqual([{ x: 151, y: 221 }]);
    send("up", { x: 151, y: 221 });
  });
});

describe("a new picture", () => {
  it("puts the tool back to Span, because its reference is gone", () => {
    for (const c of BOARD) tap(c);
    setTool("area");
    tap({ x: 100, y: 220 });
    bindSource(2, W, H, SCALE);
    expect(getState().tool).toBe("span");
    expect(getState().corners).toHaveLength(0);
    expect(getState().shapes).toHaveLength(0);
  });

  it("keeps the tool while the picture is the same one resized", () => {
    for (const c of BOARD) tap(c);
    setTool("area");
    bindSource(1, W, H, SCALE * 1.5);
    expect(getState().tool).toBe("area");
    expect(getState().corners).toHaveLength(4);
  });
});
