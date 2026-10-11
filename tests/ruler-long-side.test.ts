/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which side of the reference is the long one, against pictures with known
// truth: the room fixture's four cameras and a sweep of hand-built cameras
// with tap noise. The on-screen rule this replaces is kept here as `looksLong`
// and shown to fail the same pictures.
import { beforeEach, describe, expect, it } from "vitest";
import { derive, resultsText } from "../src/panels/ruler/derive";
import {
  looksLong,
  orderCorners,
  type Pt,
} from "../src/panels/ruler/homography";
import { chooseLongSide, longSideNote } from "../src/panels/ruler/long-side";
import {
  bindSource,
  getState,
  place,
  resetRuler,
  setCustom,
  setRef,
  toggleSwap,
} from "../src/panels/ruler/store";
import { BOARD, boardCorners, cameraFor } from "./fixtures/room-scene";
import { isLongEdge, scene, type Scene } from "./helpers/long-side-scene";

const W = 1600,
  H = 1200,
  SIGMA = 1.5;
let generation = 100;

/** Tap the fixture board in camera `cam`'s picture through the real store. */
function tapBoard(cam: number) {
  const c = cameraFor(cam, W, H);
  resetRuler();
  bindSource(++generation, W, H, 1);
  setRef("custom");
  setCustom(String(BOARD.w), String(BOARD.h));
  for (const p of boardCorners()) place(c.shoot(p.x, p.y), SIGMA);
  return c;
}
/** True when the Ruler's first edge is one of the board's 1000 mm sides. */
function firstEdgeIsLong(cam: number, ordered: Pt[]): boolean {
  const c = cameraFor(cam, W, H),
    floor = ordered.slice(0, 2).map((p) => c.floorAt(p)!);
  return (
    Math.abs(
      Math.hypot(floor[0].x - floor[1].x, floor[0].y - floor[1].y) - BOARD.w,
    ) < 1
  );
}

describe("the room fixture's cameras", () => {
  beforeEach(() => resetRuler());

  it("camera 2 looks along the board's long side: the wall reads 3.100 m with no Swap", () => {
    const c = tapBoard(1);
    place(c.shoot(0, 0), SIGMA);
    place(c.shoot(0, 3100), SIGMA);
    const d = derive(getState()),
      span = d.rows[0].span!;
    // The picture shows the long side shorter, so the on-screen rule is wrong.
    expect(looksLong(d.sheet!.ordered)).not.toBe(
      firstEdgeIsLong(1, d.sheet!.ordered),
    );
    expect(d.longSide!.how).toBe("picture");
    expect(d.sheet!.firstIsLong).toBe(firstEdgeIsLong(1, d.sheet!.ordered));
    expect(getState().swap).toBe(false);
    expect(Math.abs(span.mm - 3100)).toBeLessThanOrEqual(span.errorMm);
    expect(span.errorMm).toBeLessThan(400);
    // The picture overrules the look, and that is said beside the reference.
    expect(longSideNote(d.longSide, false)).toMatch(/looks shorter here/);
  });

  it("copied results carry the same long-side note the panel shows", () => {
    const c = tapBoard(1);
    place(c.shoot(0, 0), SIGMA);
    place(c.shoot(0, 3100), SIGMA);
    const s = getState(),
      d = derive(s),
      note = longSideNote(d.longSide, s.swap)!;
    expect(note).toMatch(/looks shorter here/);
    expect(resultsText(s, d)).toContain(note);
  });

  it("every camera gets the board the right way round, or says it guessed", () => {
    for (const cam of [0, 1, 2, 3]) {
      tapBoard(cam);
      const d = derive(getState()),
        right = d.sheet!.firstIsLong === firstEdgeIsLong(cam, d.sheet!.ordered);
      if (d.longSide!.how === "picture") expect(right).toBe(true);
      else expect(longSideNote(d.longSide, false)).toMatch(/was guessed/);
    }
  });

  it("Swap still flips the side, and is told when the picture disagrees", () => {
    tapBoard(1);
    const before = derive(getState());
    toggleSwap();
    const after = derive(getState());
    expect(after.sheet!.firstIsLong).toBe(!before.sheet!.firstIsLong);
    expect(after.longSide).toEqual(before.longSide);
    expect(longSideNote(after.longSide, true)).toMatch(/picture disagrees/);
  });
});

/** `count` seeded scenes that fit in their picture. */
function scenes(count: number, ask: Partial<Parameters<typeof scene>[0]> = {}) {
  const out: Scene[] = [];
  for (let seed = 1; out.length < count; seed++) {
    const sc = scene({ ...ask, seed });
    if (sc) out.push(sc);
  }
  return out;
}
function tally(all: Scene[], sigma = SIGMA) {
  const n = {
    right: 0,
    wrong: 0,
    guessedRight: 0,
    guessedWrong: 0,
    old: 0,
    /** Wrong, with nothing at all said beside the reference. */
    silent: 0,
  };
  for (const sc of all) {
    const o = orderCorners(sc.taps),
      truth = isLongEdge(sc, o[0], o[1]),
      side = chooseLongSide(o, sc.long, sc.short, { w: sc.w, h: sc.h }, sigma);
    if (looksLong(o) !== truth) n.old++;
    if (side.firstIsLong !== truth && longSideNote(side, false) === null)
      n.silent++;
    if (side.how === "picture")
      n[side.firstIsLong === truth ? "right" : "wrong"]++;
    else n[side.firstIsLong === truth ? "guessedRight" : "guessedWrong"]++;
  }
  return n;
}

describe("a sweep of hand-built cameras with taps 1.5 px off", () => {
  it("is never wrong without a warning in 1,200 pictures, where the on-screen rule is wrong in one of ten", () => {
    const all = scenes(1200),
      n = tally(all);
    console.info(`taps 1.5 px off, ${all.length} pictures`, n);
    // Wrong by the picture's own choice: under 1 in 500. Seen: none.
    expect(n.wrong / all.length).toBeLessThan(0.002);
    // Wrong with nothing said beside the reference: never.
    expect(n.silent).toBe(0);
    // The picture has to settle a fair share, or the rule is only a warning.
    expect(n.right / all.length).toBeGreaterThan(0.3);
    // The rule this replaces, on the same pictures, with no warning at all.
    expect(n.old / all.length).toBeGreaterThan(0.05);
  }, 120_000);

  it("stays under 2 in 100 wrong when taps are twice as far off as assumed", () => {
    const all = scenes(600, { sigma: 3 }),
      n = tally(all);
    console.info(`taps 3 px off, 1.5 assumed, ${all.length} pictures`, n);
    expect(n.wrong / all.length).toBeLessThan(0.02);
  }, 120_000);

  it("a cropped picture (optical axis a fifth of the picture off its middle) can mislead the fit, and never silently", () => {
    const all = scenes(600, { offAxis: 0.2 }),
      n = tally(all);
    console.info(`axis 20% off the middle, ${all.length} pictures`, n);
    expect(n.wrong / all.length).toBeLessThan(0.04);
    expect(n.silent).toBe(0);
  }, 120_000);

  it("looking along the long side from 30 to 44 degrees up, well off square, the picture settles it", () => {
    // The on-screen rule is wrong for most of these.
    const all = scenes(200, {
        long: 1000,
        short: 700,
        yaw: 12,
        roll: 0,
        reach: 3,
        aimOff: 0.2,
      }).filter((sc) => sc.pitch >= 30 && sc.pitch <= 44),
      n = tally(all);
    expect(all.length).toBeGreaterThan(20);
    expect(n.old / all.length).toBeGreaterThan(0.8);
    expect(n.wrong).toBe(0);
    expect(n.right / all.length).toBeGreaterThan(0.9);
  });
});

describe("pictures that cannot settle it", () => {
  const guessed = (ask: Parameters<typeof scenes>[1]) => {
    const n = tally(scenes(60, ask));
    return (n.guessedRight + n.guessedWrong) / 60;
  };
  it("a camera looking straight down is never wrong: a sheet big enough in the picture is settled, the rest are a guess", () => {
    // Straight down the sheet shows its own shape, so the guess is right too.
    const n = tally(scenes(60, { pitch: 90, aimOff: 0 }));
    expect(n.wrong + n.guessedWrong).toBe(0);
    expect(n.guessedRight).toBeGreaterThan(30);
  });
  it("a nearly square reference is a guess", () => {
    expect(guessed({ long: 300, short: 294 })).toBeGreaterThan(0.95);
  });
  it("a small, distant sheet is a guess", () => {
    expect(guessed({ long: 85.6, short: 53.98, reach: 30 })).toBeGreaterThan(
      0.95,
    );
  });
  it("a square reference has nothing to settle and no warning", () => {
    const sc = scenes(1, { long: 300, short: 300 })[0],
      side = chooseLongSide(orderCorners(sc.taps), 300, 300, sc, SIGMA);
    expect(side.how).toBe("square");
    expect(longSideNote(side, false)).toBeNull();
    expect(longSideNote(side, true)).toBeNull();
  });
  it("without the picture's size the answer is the on-screen guess, said to be one", () => {
    const sc = scenes(1)[0],
      o = orderCorners(sc.taps),
      side = chooseLongSide(o, sc.long, sc.short, null, SIGMA);
    expect(side).toEqual({
      firstIsLong: looksLong(o),
      how: "guessed",
      looks: looksLong(o),
    });
    expect(longSideNote(side, false)).toMatch(/press Swap sides/);
  });
});
