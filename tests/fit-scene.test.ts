/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, it, expect } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import { extensionEnv } from "../src/panels/ruler/extensions";
import {
  getBox,
  resetBox,
  setBox,
  setSize,
  undoBox,
} from "../src/panels/ruler/fit/box-state";
import { drawBox } from "../src/panels/ruler/fit/draw";
import { onBoxPointer } from "../src/panels/ruler/fit/pointer";
import { FIT_COVERAGE, verdicts } from "../src/panels/ruler/fit/verdict";
import { applyHomography } from "../src/panels/ruler/homography";
import { gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";
import {
  bindSource,
  clear,
  finishShape,
  getState,
  place,
  resetRuler,
  setRef,
  setCustom,
  setTool,
} from "../src/panels/ruler/store";
import type { StagePointerEvent } from "../src/stage/stage-hooks";
import {
  alcove,
  alcoveCentre,
  IMAGE,
  sheetCorners,
  shoot,
  toRuler,
  type P,
} from "./fixtures/fit-scene";

type Nudge = (p: P) => P;
const exact: Nudge = (p) => p;

/** Tap the board and outline an alcove `width` mm wide, each tap passed
 * through `nudge` (tap noise, or nothing). */
function tapScene(width: number, nudge: Nudge = exact, scale = 1) {
  resetRuler();
  resetBox();
  setRef("custom");
  setCustom("1000", "700");
  bindSource(1, IMAGE.w, IMAGE.h, scale);
  for (const c of sheetCorners()) place(nudge(c));
  setTool("area");
  for (const c of alcove(width)) place(nudge(shoot(c.x, c.y)));
  finishShape();
  setTool("box");
}
const standBox = (floor: P, w: number, d: number, h = 850) =>
  setBox({ at: toRuler(floor), w, d, h, rot: 0 }, "test");
const read = () => {
  const s = getState();
  return verdicts(s, derive(s), getBox()).rows;
};

describe("the Box tool on a picture with known truth", () => {
  beforeEach(() => tapScene(2100));

  it("works in the plane coordinates the fixture says the Ruler uses", () => {
    const { sheet } = derive(getState());
    for (const p of [alcoveCentre(2100), { x: 0, y: 1500 }]) {
      const got = applyHomography(sheet!.h, shoot(p.x, p.y))!;
      expect(got.x).toBeCloseTo(toRuler(p).x, 4);
      expect(got.y).toBeCloseTo(toRuler(p).y, 4);
    }
  });

  it("gives no verdict until the box is placed", () => {
    expect(read()).toEqual([]);
  });

  it("reads a 2000 mm box in a 2100 mm alcove as fits or too close, by the bar", () => {
    standBox(alcoveCentre(2100), 2000, 900);
    const [row] = read(),
      [v] = row.verdicts;
    expect(row.label).toBe("Area 1");
    // Truth: 50 mm at each side wall and at the front and back.
    expect(v.mm).toBeCloseTo(50, 3);
    expect(v.errorMm).toBeGreaterThan(1);
    expect(v.kind).toBe(v.errorMm < 50 ? "fits" : "close");
    expect(v.text).toMatch(
      v.errorMm < 50
        ? /^Fits, with [\d.]+ ± [\d.]+ cm of clearance$/
        : /^Too close to call: clearance too uncertain to state \(bar ± [\d.]+ cm\)\. Add /,
    );
    expect(v.measured.basis).toContain("simulated retakes");
    expect(v.measured.basis).toContain("Not included");
  });

  it("reads the same box in a 1900 mm alcove as does not fit", () => {
    tapScene(1900);
    standBox(alcoveCentre(1900), 2000, 900);
    const [v] = read()[0].verdicts;
    // Truth: 50 mm over at each side wall.
    expect(v.mm).toBeCloseTo(-50, 3);
    expect(v.errorMm).toBeLessThan(50);
    expect(v.kind).toBe("over");
    expect(v.text).toMatch(/^Does not fit: over by \d+ ± \d+ cm$/);
  });

  it("reads a box within the bar of the wall as too close to call", () => {
    // 2 mm of true clearance at the left wall: no picture can call that.
    standBox({ x: 1002, y: 2000 }, 2000, 900);
    const [v] = read()[0].verdicts;
    expect(v.mm).toBeCloseTo(2, 3);
    expect(v.kind).toBe("close");
  });

  it("checks the width and the depth against a span, with the span's bar", () => {
    setTool("span");
    // A 950 mm gap across the floor.
    place(shoot(400, 1300));
    place(shoot(1350, 1300));
    setTool("box");
    standBox(alcoveCentre(2100), 2000, 900);
    const row = read().find((r) => r.label === "Measurement 1")!,
      span = derive(getState()).rows[0].span!;
    expect(span.mm).toBeCloseTo(950, 3);
    expect(row.verdicts.map((v) => v.kind)).toEqual([
      "over",
      span.errorMm < 50 ? "fits" : "close",
    ]);
    expect(row.verdicts[0].mm).toBeCloseTo(-1050, 3);
    expect(row.verdicts[1].mm).toBeCloseTo(50, 3);
    expect(row.verdicts[1].errorMm).toBe(span.errorMm);
  });

  it("draws the top face where the true camera puts it, within a pixel", () => {
    const centre = alcoveCentre(2100);
    standBox(centre, 2000, 900, 850);
    const env = extensionEnv();
    expect(env.camera?.focalResolved).toBe(true);
    // Record what is drawn; the picture's own pixels are the canvas here.
    const drawn: P[] = [],
      ctx = new Proxy(
        {},
        {
          get: (_, name) =>
            name === "moveTo" || name === "lineTo"
              ? (x: number, y: number) => void drawn.push({ x, y })
              : name === "measureText"
                ? () => ({ width: 40 })
                : () => {},
          set: () => true,
        },
      ) as CanvasRenderingContext2D;
    drawBox(ctx, {
      ...env,
      frame: null as never,
      tapToCanvas: (p) => p,
      toCanvas: (p) => p,
    });
    for (const z of [0, 850])
      for (const [i, j] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const truth = shoot(centre.x + i * 1000, centre.y + j * 450, z),
          off = Math.min(
            ...drawn.map((p) => Math.hypot(p.x - truth.x, p.y - truth.y)),
          );
        expect(off).toBeLessThan(1);
      }
  });
});

describe("placing the box with the pointer", () => {
  beforeEach(() => tapScene(2100));
  const event = (
    type: StagePointerEvent["type"],
    p: P,
    more: Partial<StagePointerEvent> = {},
  ): StagePointerEvent => ({
    type,
    point: { x: p.x / IMAGE.w, y: p.y / IMAGE.h },
    inside: true,
    source: { width: IMAGE.w, height: IMAGE.h },
    canvas: p,
    scale: 1,
    pointerId: 1,
    pointerType: "mouse",
    cancelled: false,
    ...more,
  });
  const send = (type: StagePointerEvent["type"], floor: P, more = {}) =>
    onBoxPointer(event(type, shoot(floor.x, floor.y), more), extensionEnv());

  it("stands the box where the floor is pressed, and drags it from inside", () => {
    expect(send("down", { x: 1000, y: 2000 })).toBe(true);
    expect(send("up", { x: 1000, y: 2000 })).toBe(true);
    const at = getBox().at!;
    expect(at.x).toBeCloseTo(toRuler({ x: 1000, y: 2000 }).x, 3);
    expect(at.y).toBeCloseTo(toRuler({ x: 1000, y: 2000 }).y, 3);
    // Grab it 300 mm left of centre and carry it 50 right, 20 away.
    send("down", { x: 700, y: 2000 });
    send("move", { x: 750, y: 2020 });
    send("up", { x: 750, y: 2020 });
    expect(getBox().at!.x).toBeCloseTo(toRuler({ x: 1050, y: 2020 }).x, 3);
    expect(getBox().at!.y).toBeCloseTo(toRuler({ x: 1050, y: 2020 }).y, 3);
    // Undo: back where it was pressed, then gone.
    undoBox();
    expect(getBox().at!.x).toBeCloseTo(at.x, 9);
    undoBox();
    expect(getBox().at).toBeNull();
  });

  it("turns the box by its corner handle and leaves other pointers alone", () => {
    setSize("w", 1000);
    setSize("d", 1000);
    send("down", { x: 1000, y: 2000 });
    send("up", { x: 1000, y: 2000 });
    // The handle is the corner at plus half the width and depth in the
    // Ruler's coordinates, whose y runs toward the camera.
    send("down", { x: 1500, y: 1500 });
    // A second pointer's move is not this tool's to use.
    expect(send("move", { x: 900, y: 1700 }, { pointerId: 2 })).toBe(false);
    // Swing the handle from the diagonal to straight right of centre.
    send("move", { x: 1700, y: 2000 });
    send("up", { x: 1700, y: 2000 });
    expect(Math.abs(getBox().rot)).toBeCloseTo(45, 1);
    expect(getBox().at!.x).toBeCloseTo(toRuler({ x: 1000, y: 2000 }).x, 3);
  });

  it("puts the box back when the gesture is cancelled, and leaves the Ruler's handles alone", () => {
    send("down", { x: 1000, y: 2000 });
    send("up", { x: 1000, y: 2000 });
    const before = getBox();
    send("down", { x: 1000, y: 2000 });
    send("move", { x: 1200, y: 2100 });
    send("up", { x: 1200, y: 2100 }, { cancelled: true });
    expect(getBox().at).toEqual(before.at);
    // A press on an alcove corner is the Ruler's: the outline stays adjustable.
    expect(send("down", { x: 0, y: 1500 })).toBe(false);
    // Clear drops the box with everything else on the picture.
    clear();
    expect(getBox().at).toBeNull();
    expect(read()).toEqual([]);
  });
});

describe("the bar against noisy retakes", () => {
  // Each retake: every tap (four board corners, four alcove corners) lands
  // 1.5 px (one sd) off, as the bar assumes. The box stays put in plane mm.
  // Observed 2026-10-10 (seed 4242): near one wall 197 of 200 (98.5%) hold
  // the truth, centred 182 of 200 (91.0%), with 1 wrong "does not fit" among
  // the centred. The panel prints these shares (FIT_COVERAGE). Each floor is
  // the printed share less 2 sd of a count over 200 retakes: 2 points at
  // 98%, 4 points at 91%.
  const RETAKES = 200,
    cases = [
      // 40 mm from the left wall, 60 from the right, 150 front and back.
      {
        name: "near one wall",
        at: { x: 1040, y: 2000 },
        d: 700,
        truth: 40,
        printed: FIT_COVERAGE.nearWall,
        margin: 0.02,
      },
      // 50 mm from all four sides: the smallest of four noisy gaps. Its bar
      // holds the truth less often than 2 sd suggests, and the panel says so.
      {
        name: "centred",
        at: { x: 1050, y: 2000 },
        d: 900,
        truth: 50,
        printed: FIT_COVERAGE.centred,
        margin: 0.04,
      },
    ];

  it("holds the true clearance inside the bar in most retakes", () => {
    const normal = gaussian(seededRandom(4242)),
      inside = cases.map(() => 0),
      bars = cases.map(() => 0),
      kinds = cases.map(() => ({ fits: 0, over: 0, close: 0 }));
    for (let i = 0; i < RETAKES; i++) {
      tapScene(2100, (p) => ({
        x: p.x + 1.5 * normal(),
        y: p.y + 1.5 * normal(),
      }));
      cases.forEach((c, k) => {
        standBox(c.at, 2000, c.d);
        const [v] = read()[0].verdicts;
        if (Math.abs(v.mm - c.truth) <= v.errorMm) inside[k]++;
        bars[k] += v.errorMm / RETAKES;
        kinds[k][v.kind]++;
      });
    }
    cases.forEach((c, k) => {
      console.info(
        `fit coverage, ${c.name}: ${inside[k]}/${RETAKES} retakes hold the truth (${c.truth} mm); mean bar ${bars[k].toFixed(1)} mm; verdicts ${JSON.stringify(kinds[k])}`,
      );
      const share = inside[k] / RETAKES;
      expect(share, c.name).toBeGreaterThanOrEqual(c.printed / 100 - c.margin);
      // If the bar starts to hold more often than printed, the sentence in
      // the panel is out of date.
      expect(share, `update FIT_COVERAGE, ${c.name}`).toBeLessThanOrEqual(
        c.printed / 100 + c.margin,
      );
      // The truth is 40 or 50 mm of room, so "does not fit" is a wrong call.
      // A 2 sd bar allows a few; more than 2% of retakes would be a fault.
      expect(kinds[k].over / RETAKES).toBeLessThanOrEqual(0.02);
    });
  }, 180_000);
});
