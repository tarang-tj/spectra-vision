/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Save OBJ writes what the 3D view draws. A known room is tapped through the
// real stores twice: once with a board large enough to state the height, and
// once with a board so small that the height's bar is as large as the height.
import { beforeEach, describe, it, expect } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import {
  bindSource,
  getState,
  place,
  resetRuler,
  setCustom,
  setRef,
} from "../src/panels/ruler/store";
import { currentWalls } from "../src/panels/ruler/walls/current";
import { floorOnly, roomObj } from "../src/panels/ruler/walls/save-obj";
import { addCorner, closeRoom, setTop } from "../src/panels/ruler/walls/store";
import { heightUncertain } from "../src/panels/ruler/walls/text";
import {
  BOARD,
  boardCorners,
  RECT,
  ROOM,
  sceneFor,
} from "./fixtures/walls-scene";

const W = 1920,
  H = 1440,
  scene = sceneFor(W, H),
  /** Half the board, where the board lies. From this camera the mean height
   * then reads 2440 with a bar of about 3280 mm (and 95% of the retakes give
   * an answer), so it is a number that is too uncertain to state. */
  SHEET = { x: 1600, y: 700, w: 500, h: 350 };

function tapRoom(board: typeof BOARD, tops: boolean) {
  resetRuler();
  setRef("custom");
  setCustom(String(board.w), String(board.h));
  bindSource(1, W, H, 1);
  for (const c of boardCorners(board)) place(scene.shoot(c.x, c.y));
  for (const c of RECT) addCorner(scene.shoot(c.x, c.y));
  closeRoom();
  if (tops) RECT.forEach((c, i) => setTop(i, scene.shoot(c.x, c.y, ROOM.h)));
  const s = getState();
  return currentWalls(s, derive(s));
}
const count = (obj: string, tag: string) =>
  obj.split("\n").filter((l) => l.startsWith(`${tag} `)).length;
const zs = (obj: string) =>
  obj
    .split("\n")
    .filter((l) => l.startsWith("v "))
    .map((l) => Number(l.split(" ")[3]));

describe("Save OBJ against the 3D view", () => {
  beforeEach(() => resetRuler());

  it("writes the whole shell when the height is stated", () => {
    const cur = tapRoom(BOARD, true),
      vague = heightUncertain(cur.numbers!);
    expect(vague).toBe(false);
    expect(floorOnly(cur, vague)).toBeNull();
    const obj = roomObj(cur, vague)!;
    expect(count(obj, "f")).toBe(cur.preview!.faces.length);
    expect(count(obj, "f")).toBe(6);
    expect(count(obj, "v")).toBe(8);
    expect(obj).not.toContain("Floor only");
    expect(Math.max(...zs(obj))).toBeCloseTo(ROOM.h / 1000, 2);
  });

  it("writes the floor alone, and says so, when the height is too uncertain to draw", () => {
    const cur = tapRoom(SHEET, true),
      n = cur.numbers!,
      vague = heightUncertain(n);
    // The height is there as a number with a bar as large as itself: the
    // case in which the 3D view draws no walls.
    expect(n.meanHeight).not.toBeNull();
    expect(n.meanHeight!.error).toBeGreaterThanOrEqual(n.meanHeight!.value);
    expect(vague).toBe(true);
    expect(cur.preview!.faces.map((f) => f.name)).toEqual(["floor"]);
    // The full mesh still has walls: writing it would disagree with the view.
    expect(cur.mesh!.faces.length).toBeGreaterThan(1);
    expect(floorOnly(cur, vague)).toBe("uncertain");
    const obj = roomObj(cur, vague)!;
    expect(count(obj, "f")).toBe(1);
    expect(count(obj, "v")).toBe(4);
    expect(zs(obj).every((z) => z === 0)).toBe(true);
    expect(obj).toContain(
      "# Floor only: the heights are too uncertain to write as walls.",
    );
  });

  it("writes the floor alone when no height was measured, with that reason", () => {
    const cur = tapRoom(BOARD, false);
    expect(floorOnly(cur, false)).toBe("unmeasured");
    const obj = roomObj(cur, false)!;
    expect(count(obj, "f")).toBe(1);
    expect(obj).toContain("# Floor only: no height was measured.");
  });
});
