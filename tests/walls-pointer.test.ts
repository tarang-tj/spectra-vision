/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls tool's hold on a pointer. A press that never gets its release
// (the picture was cleared under the finger) must not block the next one.
import { beforeEach, describe, it, expect } from "vitest";
import { extensionEnv } from "../src/panels/ruler/extensions";
import {
  bindSource,
  clear,
  place,
  resetRuler,
  setCustom,
  setRef,
} from "../src/panels/ruler/store";
import { dropGrab, wallsPointer } from "../src/panels/ruler/walls/pointer";
import { getWalls } from "../src/panels/ruler/walls/store";
import type { StagePointerEvent } from "../src/stage/stage-hooks";
import { boardCorners, RECT, sceneFor, type P } from "./fixtures/walls-scene";

const W = 1920,
  H = 1440,
  scene = sceneFor(W, H),
  corner = (i: number) => scene.shoot(RECT[i].x, RECT[i].y);

function tapBoard() {
  setRef("custom");
  setCustom("1000", "700");
  bindSource(1, W, H, 1);
  for (const c of boardCorners()) place(scene.shoot(c.x, c.y));
}
const send = (type: StagePointerEvent["type"], p: P, pointerId: number) =>
  wallsPointer(
    {
      type,
      point: { x: p.x / W, y: p.y / H },
      inside: true,
      source: { width: W, height: H },
      canvas: p,
      scale: 1,
      pointerId,
      pointerType: "touch",
      cancelled: false,
    },
    extensionEnv(),
  );

describe("the Walls pointer grab", () => {
  beforeEach(() => {
    resetRuler();
    dropGrab();
    tapBoard();
  });

  it("keeps a second finger from placing a point while the first holds one", () => {
    expect(send("down", corner(0), 1)).toBe(true);
    expect(send("down", corner(1), 2)).toBe(true);
    expect(getWalls().corners).toHaveLength(1);
    send("up", corner(0), 1);
    send("down", corner(1), 2);
    expect(getWalls().corners).toHaveLength(2);
  });

  it("lets go of a held point when the Ruler's points are cleared", () => {
    // Finger 1 presses a floor corner and its release never arrives.
    send("down", corner(0), 1);
    expect(getWalls().corners).toHaveLength(1);
    clear();
    expect(getWalls().corners).toHaveLength(0);
    tapBoard();
    // Another finger can place the first corner of the next room.
    expect(send("down", corner(1), 2)).toBe(true);
    expect(getWalls().corners).toHaveLength(1);
    const at = getWalls().corners[0].base;
    expect(at.x).toBeCloseTo(corner(1).x, 6);
    expect(at.y).toBeCloseTo(corner(1).y, 6);
  });
});
