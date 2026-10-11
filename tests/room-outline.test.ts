/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import type { StagePointerEvent } from "../src/stage/stage-hooks";
import { extensionEnv } from "../src/panels/ruler/extensions";
import { resetBox } from "../src/panels/ruler/fit/box-state";
import { currentRoom, stageView } from "../src/panels/ruler/room/current";
import { placedPoints } from "../src/panels/ruler/room/picks";
import { roomPointer } from "../src/panels/ruler/room/pointer";
import { roomStep } from "../src/panels/ruler/room/room-section";
import {
  addPoint,
  closeOutline,
  getRoom,
  loadRoom,
  removePoint,
  setCorner,
  setNext,
  tapRoom,
  undoRoom,
  unmark,
} from "../src/panels/ruler/room/store";
import { areaOf, lengthOf, roomBasis } from "../src/panels/ruler/room/text";
import { dropFrames } from "../src/panels/ruler/room/view-frame";
import {
  addView,
  getViews,
  removeView,
  resetViews,
  showView,
  viewOf,
  type Load,
} from "../src/panels/ruler/room/views-store";
import {
  bindSource,
  getState,
  place,
  resetRuler,
  setCustom,
  setRef,
  setTool,
  toggleSwap,
} from "../src/panels/ruler/store";
import { derive } from "../src/panels/ruler/derive";
import {
  AREA_MM2,
  BOARD,
  boardCorners,
  cameraFor,
  CORNERS,
  MARKS,
  PERIMETER_MM,
  WALLS_MM,
  type P,
} from "./fixtures/room-scene";
import { H, snapOf, tapOn, W } from "./helpers/room-build";

let generation = 0;
const load: Load = async () => {
    const mine = ++generation;
    bindSource(mine, W, H, 1);
    return mine;
  },
  png = () => new Blob(["x"], { type: "image/png" });

/** Add camera `cam`'s picture and tap its reference through the real stores,
 * pressing Swap sides when the edge labels come out the wrong way round. */
async function addCamera(cam: number): Promise<number> {
  const id = (await addView(png(), `cam-${cam}.png`, load))!;
  for (const c of boardCorners()) place(tapOn(cam, c), 1.5);
  if (snapOf({ cam }).ruler.swap !== getState().swap) toggleSwap();
  expect(derive(getState()).sheet).not.toBeNull();
  return id;
}
const press = (
  type: StagePointerEvent["type"],
  p: P,
  extra: Partial<StagePointerEvent> = {},
): StagePointerEvent => ({
  type,
  point: { x: p.x / W, y: p.y / H },
  inside: true,
  source: { width: W, height: H },
  canvas: { x: p.x, y: p.y },
  scale: 1,
  pointerId: 1,
  pointerType: "mouse",
  cancelled: false,
  ...extra,
});
/** A click on floor point `p` in camera `cam`'s picture, through the tool. */
function click(cam: number, p: P) {
  const at = cameraFor(cam, W, H).shoot(p.x, p.y);
  expect(roomPointer(press("down", at), extensionEnv())).toBe(true);
  roomPointer(press("up", at), extensionEnv());
}

beforeEach(() => {
  resetViews();
  loadRoom(null);
  resetRuler();
  resetBox();
  dropFrames();
  generation = 0;
  setRef("custom");
  setCustom(String(BOARD.w), String(BOARD.h));
});

describe("the Room tool through the stores", () => {
  it("outlines a room whose corners are in two pictures: walls, perimeter and area against truth", async () => {
    // Camera 0 sees corners 2 and 3; camera 2 sees corners 0 and 1.
    const a = await addCamera(0);
    setTool("room");
    click(0, CORNERS[2]);
    click(0, CORNERS[3]);
    setNext({ kind: "mark" });
    click(0, MARKS[0]);
    setNext({ kind: "mark" });
    click(0, MARKS[1]);
    expect(getRoom().outline).toEqual([1, 2]);
    expect(getRoom().points.map((p) => p.obs[0].view)).toEqual([a, a, a, a]);

    const b = await addCamera(2);
    // The tool stays Room on the new picture; its corners came first.
    expect(getState().tool).toBe("room");
    let cur = currentRoom();
    expect(cur.solution.views[1].state).toBe("unanchored");
    click(2, CORNERS[0]);
    click(2, CORNERS[1]);
    closeOutline(true);
    cur = currentRoom();
    // Two corners are only in a picture that is not on the plan: no numbers.
    expect(cur.solution.numbers).toBeNull();
    expect(cur.solution.missing).toEqual([5, 6]);

    setNext({ kind: "link", point: 3 });
    expect(roomStep(getRoom(), 2, viewOf(b), true)).toContain(
      "Tap Room point 3 in this picture",
    );
    click(2, MARKS[0]);
    expect(getRoom().next).toEqual({ kind: "mark" });
    // One shared point only suggests a turn: still nothing from picture 2.
    cur = currentRoom();
    expect(cur.solution.views[1].state).toBe("provisional");
    expect(cur.solution.numbers).toBeNull();
    setNext({ kind: "link", point: 4 });
    click(2, MARKS[1]);
    cur = currentRoom();
    expect(cur.solution.views[1].state).toBe("placed");
    expect(cur.solution.views[1].text).toContain("half way round");
    const n = cur.solution.numbers!;
    // Walls in outline order: corner 2 to 3, 3 to 0, 0 to 1, 1 to 2.
    [WALLS_MM[2], WALLS_MM[3], WALLS_MM[0], WALLS_MM[1]].forEach((mm, i) => {
      expect(Math.abs(n.walls[i]!.value - mm) / mm).toBeLessThan(0.01);
      expect(Math.abs(n.walls[i]!.value - mm)).toBeLessThanOrEqual(
        n.walls[i]!.error,
      );
    });
    expect(Math.abs(n.area!.value - AREA_MM2) / AREA_MM2).toBeLessThan(0.01);
    expect(
      Math.abs(n.length!.value - PERIMETER_MM) / PERIMETER_MM,
    ).toBeLessThan(0.01);
    // A wall inside one picture rests on one; one across pictures on both.
    expect(cur.solution.wallViews).toEqual([[a], [a, b], [b], [a, b]]);
    expect(cur.solution.outlineViews).toEqual([a, b]);

    // Each number is a Measured whose basis names its pictures.
    const order = getViews().views.map((v) => v.id),
      wall = lengthOf(
        n.walls[1]!,
        "m",
        roomBasis(cur.solution.wallViews[1], order),
      ),
      area = areaOf(n.area!, "m", roomBasis(cur.solution.outlineViews, order));
    expect(wall.unit).toBe("m");
    expect(wall.value).toBeCloseTo(3.1, 2);
    expect(wall.error).toBeGreaterThan(0);
    expect(wall.basis).toContain("Rests on 2 pictures (pictures 1 and 2).");
    expect(wall.basis).toContain("Not included:");
    expect(area.unit).toBe("m²");
    expect(roomBasis([a], order)).toContain("Rests on 1 picture (picture 1).");

    // Switching pictures changes no number: they rest on the stored taps.
    const before = JSON.stringify(n);
    await showView(a, load);
    expect(JSON.stringify(currentRoom().solution.numbers)).toBe(before);
    // Removing a picture takes its marks, and the corners only it showed.
    await removeView(b, load);
    expect(getRoom().points.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(getRoom().outline).toEqual([1, 2]);
    expect(getRoom().closed).toBe(false);
  });

  it("drags a mark, closes on a tap of the first corner, and leaves the Ruler's handles alone", async () => {
    const a = await addCamera(0);
    setTool("room");
    const env = () => extensionEnv(),
      c = cameraFor(0, W, H),
      p0 = c.shoot(CORNERS[2].x, CORNERS[2].y);
    click(0, CORNERS[2]);
    click(0, CORNERS[3]);
    click(0, MARKS[1]);
    // A press on the reference's corner is not the tool's: the Ruler takes it.
    const ref = getState().corners[0];
    expect(roomPointer(press("down", ref), env())).toBe(false);
    expect(getRoom().points).toHaveLength(3);
    // A drag moves the mark it started on; it is not a step for Undo.
    roomPointer(press("down", p0), env());
    roomPointer(press("move", { x: p0.x + 20, y: p0.y + 5 }), env());
    roomPointer(press("up", { x: p0.x + 20, y: p0.y + 5 }), env());
    expect(getRoom().points[0].obs[0].at).toMatchObject({
      x: p0.x + 20,
      y: p0.y + 5,
      s: 1.5,
    });
    expect(getRoom().points).toHaveLength(3);
    // A tap on the first corner closes an outline of three or more.
    expect(getRoom().closed).toBe(false);
    const first = getRoom().points[0].obs[0].at;
    roomPointer(press("down", first), env());
    roomPointer(press("up", first), env());
    expect(getRoom().closed).toBe(true);
    undoRoom();
    expect(getRoom().closed).toBe(false);
    undoRoom();
    expect(getRoom().points).toHaveLength(2);
    // With no room picture on the stage the tool takes nothing.
    bindSource(++generation, W, H, 1);
    expect(stageView(getState().generation)).toBeNull();
    expect(viewOf(a)).not.toBeNull();
    expect(roomPointer(press("down", p0), env())).toBe(false);
  });
});

describe("the room's points", () => {
  it("adds, links, unmarks, reorders and removes, and drops what a removed picture alone showed", () => {
    const at = (x: number) => ({ x, y: 10, s: 1.5 });
    expect(tapRoom(1, at(1))).toBe(1);
    expect(tapRoom(1, at(2))).toBe(2);
    expect(tapRoom(2, at(3))).toBe(3);
    setNext({ kind: "link", point: 2 });
    expect(tapRoom(2, at(4))).toBe(2);
    expect(getRoom().points[1].obs).toEqual([
      { view: 1, at: at(2) },
      { view: 2, at: at(4) },
    ]);
    // Marking it again in the same picture replaces that mark.
    setNext({ kind: "link", point: 2 });
    tapRoom(2, at(5));
    expect(getRoom().points[1].obs).toHaveLength(2);
    expect(getRoom().points[1].obs[1].at).toEqual(at(5));
    expect(getRoom().outline).toEqual([1, 2, 3]);
    // Out of the outline and back in puts it at the end.
    setCorner(1, false);
    setCorner(1, true);
    expect(getRoom().outline).toEqual([2, 3, 1]);
    closeOutline(true);
    // Closed: a tap is a floor mark, and corners cannot be added by tapping.
    setNext({ kind: "corner" });
    expect(getRoom().next).toEqual({ kind: "mark" });
    expect(tapRoom(1, at(6))).toBe(4);
    expect(getRoom().outline).toEqual([2, 3, 1]);
    unmark(2, 1);
    expect(getRoom().points[1].obs).toEqual([{ view: 2, at: at(5) }]);
    // Its last mark takes the point with it, and an outline under three opens.
    unmark(2, 2);
    expect(getRoom().points.map((p) => p.id)).toEqual([1, 3, 4]);
    expect(getRoom().closed).toBe(false);
    removePoint(4);
    undoRoom();
    expect(getRoom().points.map((p) => p.id)).toEqual([1, 3, 4]);
    expect(addPoint(1, at(7), false)).toBe(5);
  });

  it("offers the points the other tools placed, by picture and name", async () => {
    const a = await addCamera(0);
    place({ x: 100, y: 900 }, 1.5);
    place({ x: 300, y: 950 }, 1.5);
    setTool("area");
    for (const p of [
      { x: 500, y: 900 },
      { x: 700, y: 900 },
      { x: 600, y: 1000 },
    ])
      place(p, 1.5);
    const picks = placedPoints(getViews().views);
    expect(picks.map((p) => p.label)).toEqual([
      "Picture 1: span 1, first end",
      "Picture 1: span 1, second end",
      "Picture 1: outline 1, point 1",
      "Picture 1: outline 1, point 2",
      "Picture 1: outline 1, point 3",
    ]);
    expect(picks[1]).toMatchObject({ view: a, at: { x: 300, y: 950, s: 1.5 } });
  });
});
