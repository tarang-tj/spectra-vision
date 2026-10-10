/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, it, expect } from "vitest";
import { cameraOf } from "../src/panels/ruler/camera-of";
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
  boardCorners,
  RECT,
  ROOM,
  sceneFor,
  type P,
} from "./fixtures/walls-scene";

const W = 1920,
  H = 1440,
  scene = sceneFor(W, H),
  exact = (p: P) => p,
  AREA = ROOM.w * ROOM.d;

/** Tap the board and the rectangular room through the real stores. `nudge`
 * moves each tap as a hand would; `tops` says which corners get a ceiling
 * point. */
function tapRoom(
  tops: boolean[] = [true, true, true, true],
  nudge: (p: P) => P = exact,
) {
  resetRuler();
  setRef("custom");
  setCustom("1000", "700");
  bindSource(1, W, H, 1);
  for (const c of boardCorners()) place(nudge(scene.shoot(c.x, c.y)));
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
    expect(n.offCorners).toEqual([]);
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
    const top = scene.shoot(RECT[2].x, RECT[2].y, ROOM.h);
    movePoint("top", 2, { x: top.x + 120, y: top.y });
    const s = getState(),
      n = currentWalls(s, derive(s)).numbers!;
    expect(n.offCorners).toEqual([2]);
    expect(n.shell.offs[2]!).toBeGreaterThan(9);
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

describe("what the ceiling points buy", () => {
  it("narrows the height bar at corner 1 as more plumb edges are marked", () => {
    const one = tapRoom([true, false, false, false]).numbers!.heights[0]!,
      all = tapRoom().numbers!.heights[0]!;
    console.log(
      `height bar at corner 1: ${one.error.toFixed(1)} mm with its own ceiling point alone, ${all.error.toFixed(1)} mm with all four`,
    );
    expect(all.error).toBeLessThan(one.error);
  });
});

describe("coverage of the bars", () => {
  it("holds true height and true floor area in about 95% of 200 noisy retakes", () => {
    const RETAKES = 200,
      normal = gaussian(seededRandom(4242)),
      // One tap uncertainty: 1.5 screen pixels at a display scale of 1.
      nudge = (p: P) => ({ x: p.x + 1.5 * normal(), y: p.y + 1.5 * normal() });
    let height = 0,
      area = 0,
      volume = 0,
      flagged = 0;
    for (let i = 0; i < RETAKES; i++) {
      const n = tapRoom([true, true, true, true], nudge).numbers!;
      if (inside(n.meanHeight, ROOM.h)) height++;
      if (inside(n.floorArea, AREA)) area++;
      if (inside(n.volume, AREA * ROOM.h)) volume++;
      if (n.offCorners.length) flagged++;
    }
    console.log(
      `coverage over ${RETAKES} retakes: mean height ${height}, floor area ${area}, volume ${volume}; retakes with an off-plumb warning ${flagged}`,
    );
    // 2 sd of a normal spread covers 95.4%; 200 retakes resolve that to
    // about 3 points either way.
    expect(height / RETAKES).toBeGreaterThanOrEqual(0.9);
    expect(area / RETAKES).toBeGreaterThanOrEqual(0.9);
  }, 300_000);
});
