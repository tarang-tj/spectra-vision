/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  bindSource,
  bindStillness,
  finishShape,
  getState,
  isEmpty,
  place,
  resetRuler,
  setTool,
  undo,
} from "../src/panels/ruler/store";

const corners = [
  { x: 100, y: 100 },
  { x: 500, y: 110 },
  { x: 490, y: 400 },
  { x: 95, y: 390 },
];
beforeEach(() => {
  resetRuler();
  bindSource(1, 1000, 800, 1);
});

describe("points belong to one frozen frame", () => {
  it("clears corners, spans and shapes when a video goes from still to live", () => {
    bindStillness(true, true);
    corners.forEach((c) => place(c));
    place({ x: 600, y: 500 });
    place({ x: 800, y: 500 });
    setTool("area");
    [
      { x: 10, y: 10 },
      { x: 200, y: 10 },
      { x: 200, y: 200 },
    ].forEach((p) => place(p));
    finishShape();
    expect(isEmpty(getState())).toBe(false);
    bindStillness(true, false); // the picture moves on
    expect(isEmpty(getState())).toBe(true);
    bindStillness(true, true); // frozen again: still empty
    expect(isEmpty(getState())).toBe(true);
  });
  it("keeps the points of a still photo", () => {
    corners.forEach((c) => place(c));
    bindStillness(false, true);
    bindStillness(false, true);
    expect(getState().corners).toHaveLength(4);
  });
  it("does not clear while a video stays frozen", () => {
    corners.forEach((c) => place(c));
    bindStillness(true, true);
    bindStillness(true, true);
    expect(getState().corners).toHaveLength(4);
  });
});

describe("shapes in the store", () => {
  it("starts an outline after the four reference corners and closes it on finish", () => {
    setTool("area");
    corners.forEach((c) => place(c));
    expect(getState().shapes).toHaveLength(0);
    place({ x: 10, y: 10 });
    place({ x: 200, y: 10 });
    finishShape(); // too short: stays open
    expect(getState().shapes[0].done).toBe(false);
    place({ x: 200, y: 200 });
    finishShape();
    expect(getState().shapes[0].done).toBe(true);
    place({ x: 5, y: 5 });
    expect(getState().shapes).toHaveLength(2);
  });
  it("drops a half-built shape that is too short when the tool changes", () => {
    setTool("path");
    corners.forEach((c) => place(c));
    place({ x: 10, y: 10 });
    place({ x: 20, y: 20 });
    setTool("span");
    expect(getState().shapes).toHaveLength(0);
  });
  it("undo reopens a closed outline and removes its last vertex", () => {
    setTool("area");
    corners.forEach((c) => place(c));
    [
      { x: 10, y: 10 },
      { x: 200, y: 10 },
      { x: 200, y: 200 },
    ].forEach((p) => place(p));
    finishShape();
    undo();
    expect(getState().shapes[0].pts).toHaveLength(2);
    expect(getState().shapes[0].done).toBe(false);
    expect(getState().corners).toHaveLength(4);
  });
});
