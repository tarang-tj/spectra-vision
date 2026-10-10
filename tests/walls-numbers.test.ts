/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, it, expect } from "vitest";
import { cameraOf, cameraTrials } from "../src/panels/ruler/camera-of";
import { derive } from "../src/panels/ruler/derive";
import { gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";
import { allPlumbs } from "../src/panels/ruler/plumbs";
import {
  bindSource,
  clear,
  getState,
  place,
  resetRuler,
  setCustom,
  setRef,
} from "../src/panels/ruler/store";
import { currentWalls } from "../src/panels/ruler/walls/current";
import type { Q } from "../src/panels/ruler/walls/numbers";
import {
  addCorner,
  closeRoom,
  getWalls,
  movePoint,
  setTop,
  undoWalls,
} from "../src/panels/ruler/walls/store";
import {
  BIG_BOARD,
  BOARD,
  boardCorners,
  HIGH,
  RECT,
  ROOM,
  sceneFor,
  type P,
} from "./fixtures/walls-scene";

const W = 1920,
  H = 1440,
  near = sceneFor(W, H),
  exact = (p: P) => p,
  AREA = ROOM.w * ROOM.d;

/** Tap the board and the rectangular room through the real stores. `nudge`
 * moves each tap as a hand would; `tops` says which corners get a ceiling
 * point. */
function tapRoom(
  tops: boolean[] = [true, true, true, true],
  nudge: (p: P) => P = exact,
  scene = near,
  board = BOARD,
) {
  resetRuler();
  setRef("custom");
  setCustom(String(board.w), String(board.h));
  bindSource(1, W, H, 1);
  for (const c of boardCorners(board)) place(nudge(scene.shoot(c.x, c.y)));
  for (const c of RECT) addCorner(nudge(scene.shoot(c.x, c.y)));
  closeRoom();
  RECT.forEach((c, i) => {
    if (tops[i]) setTop(i, nudge(scene.shoot(c.x, c.y, ROOM.h)));
  });
  const s = getState();
  return currentWalls(s, derive(s));
}
const inside = (q: Q | null, truth: number) =>
  !!q && Math.abs(q.value - truth) <= q.error;

describe("the Walls numbers through the Ruler's stores", () => {
  beforeEach(() => resetRuler());

  it("puts truth inside every bar with exact taps, and every bar is real", () => {
    const n = tapRoom().numbers!;
    [4200, 3100, 4200, 3100].forEach((mm, i) => {
      expect(n.walls[i]!.value).toBeCloseTo(mm, 2);
      expect(n.walls[i]!.error).toBeGreaterThan(1);
    });
    n.heights.forEach((q) => {
      expect(q!.value).toBeCloseTo(ROOM.h, 1);
      expect(q!.error).toBeGreaterThan(1);
      expect(q!.error).toBeLessThan(ROOM.h / 2);
    });
    expect(inside(n.meanHeight, ROOM.h)).toBe(true);
    expect(inside(n.floorArea, AREA)).toBe(true);
    expect(inside(n.wallArea, 2 * (ROOM.w + ROOM.d) * ROOM.h)).toBe(true);
    expect(inside(n.volume, AREA * ROOM.h)).toBe(true);
    expect(n.volume!.error).toBeGreaterThan(0);
    expect(n.kept).toBe(1);
    expect(n.trials).toBe(200);
    expect(currentWalls(getState(), derive(getState())).offCorners).toEqual([]);
  });

  it("is seeded and memoized: the same taps give the same object", () => {
    const first = tapRoom(),
      s = getState();
    expect(currentWalls(s, derive(s))).toBe(first);
    const again = tapRoom();
    expect(again).not.toBe(first);
    expect(again.numbers!.volume).toEqual(first.numbers!.volume);
  });

  it("publishes each base and ceiling pair as a plumb edge, and drops them on Clear", () => {
    tapRoom([true, false, true, false]);
    expect(allPlumbs()).toHaveLength(2);
    const before = cameraOf(getState(), derive(getState()));
    // Dragging a floor corner with no ceiling point leaves the camera alone.
    movePoint("base", 1, { x: 900, y: 900 });
    expect(cameraOf(getState(), derive(getState()))).toBe(before);
    clear();
    expect(allPlumbs()).toHaveLength(0);
    expect(getWalls().corners).toHaveLength(0);
  });

  it("shows heights as not measured with no ceiling point, floor numbers still given", () => {
    const n = tapRoom([false, false, false, false]).numbers!;
    expect(n.heights.every((q) => q === null)).toBe(true);
    expect(n.meanHeight).toBeNull();
    expect(n.volume).toBeNull();
    expect(inside(n.floorArea, AREA)).toBe(true);
  });

  it("flags a ceiling point far off the plumb line through its corner", () => {
    tapRoom();
    const top = near.shoot(RECT[2].x, RECT[2].y, ROOM.h);
    movePoint("top", 2, { x: top.x + 40, y: top.y });
    const s = getState();
    // Only that corner, although its pair bends the camera every height uses.
    expect(currentWalls(s, derive(s)).offCorners).toEqual([2]);
  });

  it("undoes one tap at a time, back through the close", () => {
    tapRoom([true, false, false, false]);
    undoWalls();
    expect(getWalls().corners[0].top).toBeNull();
    expect(allPlumbs()).toHaveLength(0);
    undoWalls();
    expect(getWalls().closed).toBe(false);
    undoWalls();
    expect(getWalls().corners).toHaveLength(3);
  });
});

/** Printed only when asked for (WALLS_REPORT=1), to keep the suite quiet. */
const report = (line: string) => {
  if (process.env.WALLS_REPORT) process.stderr.write(`\n[walls] ${line}\n`);
};
const focalSd = () => {
  const s = getState(),
    f = cameraTrials(s, derive(s)).trials.map((t) => t.camera!.f),
    mean = f.reduce((t, v) => t + v, 0) / f.length;
  return Math.sqrt(f.reduce((t, v) => t + (v - mean) ** 2, 0) / (f.length - 1));
};

describe("what the ceiling points buy", () => {
  it("steadies the focal length from the first plumb edge on, seen from high up", () => {
    const high = sceneFor(W, H, HIGH.eye, HIGH.target),
      sd = [
        [false, false, false, false],
        [true, false, false, false],
        [true, true, true, true],
      ].map((tops) => {
        tapRoom(tops, exact, high);
        return focalSd();
      });
    report(
      `high view, focal length sd over the retakes: ${sd.map((v) => v.toFixed(1)).join(" -> ")} px with 0, 1 and 4 ceiling points (true f ${high.f})`,
    );
    expect(sd[1]).toBeLessThan(0.6 * sd[0]);
    expect(sd[2]).toBeLessThan(sd[1]);
  });

  it("narrows the mean height bar as more corners are measured", () => {
    const one = tapRoom([true, false, false, false]).numbers!,
      all = tapRoom().numbers!;
    report(
      `near view, corner 1 height bar: ${one.heights[0]!.error.toFixed(0)} mm with its own ceiling point alone, ${all.heights[0]!.error.toFixed(0)} mm with all four; mean height bar ${one.meanHeight!.error.toFixed(0)} -> ${all.meanHeight!.error.toFixed(0)} mm`,
    );
    expect(all.meanHeight!.error).toBeLessThan(0.6 * one.meanHeight!.error);
    // One corner's own bar does not narrow: it is set by how well the small
    // reference fixes that corner on the floor, which no plumb edge changes.
    expect(all.heights[0]!.error / one.heights[0]!.error).toBeGreaterThan(0.8);
  });
});

describe("coverage of the bars", () => {
  it("holds true height and true floor area in about 95% of 200 noisy retakes", () => {
    const RETAKES = 200,
      normal = gaussian(seededRandom(4242)),
      // One tap uncertainty: 1.5 screen pixels at a display scale of 1.
      nudge = (p: P) => ({ x: p.x + 1.5 * normal(), y: p.y + 1.5 * normal() });
    const ratio: number[] = [];
    let height = 0,
      area = 0,
      volume = 0,
      flagged = 0;
    for (let i = 0; i < RETAKES; i++) {
      const cur = tapRoom([true, true, true, true], nudge),
        n = cur.numbers!;
      if (inside(n.meanHeight, ROOM.h)) height++;
      if (inside(n.floorArea, AREA)) area++;
      if (inside(n.volume, AREA * ROOM.h)) volume++;
      if (cur.offCorners.length) flagged++;
      ratio.push(Math.abs(n.floorArea!.value - AREA) / n.floorArea!.error);
    }
    ratio.sort((a, b) => a - b);
    report(
      `coverage over ${RETAKES} retakes: mean height ${height}, floor area ${area}, volume ${volume}; retakes with a false off-plumb warning ${flagged}; floor area miss over bar, median ${ratio[100].toFixed(2)}, 95th percentile ${ratio[190].toFixed(2)}`,
    );
    // 2 sd of a normal spread covers 95.4%; 200 retakes resolve that to
    // about 3 points either way.
    expect(height / RETAKES).toBeGreaterThanOrEqual(0.9);
    expect(area / RETAKES).toBeGreaterThanOrEqual(0.9);
  }, 300_000);

  // The test above cannot tell a bar that is right from one that is far too
  // wide: with the small board every retake is inside. With a 2000 x 1400 mm
  // reference the bars are tight enough to be judged from both sides.
  it("is neither much too narrow nor much too wide with a 2000 x 1400 mm reference", () => {
    const RETAKES = 200,
      normal = gaussian(seededRandom(4242)),
      nudge = (p: P) => ({ x: p.x + 1.5 * normal(), y: p.y + 1.5 * normal() }),
      got = { height: [] as Q[], area: [] as Q[] };
    for (let i = 0; i < RETAKES; i++) {
      const n = tapRoom(
        [true, true, true, true],
        nudge,
        near,
        BIG_BOARD,
      ).numbers!;
      got.height.push(n.meanHeight!);
      got.area.push(n.floorArea!);
    }
    for (const [name, truth] of [
      ["height", ROOM.h],
      ["area", AREA],
    ] as const) {
      const qs = got[name],
        hits = qs.filter((q) => inside(q, truth)).length,
        mean = qs.reduce((t, q) => t + q.value, 0) / RETAKES,
        // What the bar claims to be: 2 sd of the value over real retakes.
        spread =
          2 *
          Math.sqrt(
            qs.reduce((t, q) => t + (q.value - mean) ** 2, 0) / (RETAKES - 1),
          ),
        bar = qs.map((q) => q.error).sort((a, b) => a - b)[RETAKES / 2];
      report(
        `2000 x 1400 mm reference, ${name}: ${hits} of ${RETAKES} retakes hold the truth; 2 sd of the retakes ${spread.toPrecision(4)}, median bar ${bar.toPrecision(4)}, ratio ${(spread / bar).toFixed(3)}`,
      );
      // Observed 2026-10-10: 194 of 200 inside for both, ratio 0.970 for the
      // height and 0.973 for the area. 2 sd of a normal spread holds 95.4%,
      // and 200 retakes scatter that count by 1.5 points (one sd), so under
      // 92% is a bar too narrow and over 99% (199 or 200 of 200) one too wide.
      expect(hits / RETAKES, name).toBeGreaterThanOrEqual(0.92);
      expect(hits / RETAKES, name).toBeLessThanOrEqual(0.99);
      // A spread taken from 200 values scatters by 5% (one sd), so a ratio
      // outside 0.8 to 1.25 is not chance: the bar is wrong by a quarter.
      expect(spread / bar, name).toBeGreaterThan(0.8);
      expect(spread / bar, name).toBeLessThan(1.25);
    }
  }, 300_000);
});
