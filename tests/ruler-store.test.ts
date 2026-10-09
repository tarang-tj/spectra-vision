/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeEach } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import {
  bindSource,
  clear,
  getState,
  hit,
  move,
  place,
  resetRuler,
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

describe("ruler store", () => {
  it("takes four corners, then measurement endpoints in pairs", () => {
    corners.forEach((c) => place(c));
    expect(getState().corners).toHaveLength(4);
    place({ x: 600, y: 500 });
    expect(getState().measures).toEqual([{ a: { x: 600, y: 500 }, b: null }]);
    place({ x: 800, y: 500 });
    expect(getState().measures[0].b).toEqual({ x: 800, y: 500 });
    place({ x: 10, y: 10 });
    expect(getState().measures).toHaveLength(2);
  });
  it("drags a handle and finds the nearest one", () => {
    const h = place(corners[0]);
    move(h, { x: 120, y: 90 });
    expect(getState().corners[0]).toEqual({ x: 120, y: 90 });
    expect(hit({ x: 123, y: 92 }, 10)).toEqual({ kind: "corner", i: 0 });
    expect(hit({ x: 300, y: 300 }, 10)).toBeNull();
  });
  it("keeps points inside the picture", () => {
    const h = place({ x: -50, y: 5000 });
    expect(getState().corners[0]).toEqual({ x: 0, y: 800 });
    move(h, { x: 2000, y: -1 });
    expect(getState().corners[0]).toEqual({ x: 1000, y: 0 });
  });
  it("undoes the last point and clears", () => {
    corners.forEach((c) => place(c));
    place({ x: 1, y: 1 });
    place({ x: 2, y: 2 });
    undo();
    expect(getState().measures[0].b).toBeNull();
    undo();
    expect(getState().measures).toHaveLength(0);
    undo();
    expect(getState().corners).toHaveLength(3);
    clear();
    expect(getState().corners).toHaveLength(0);
  });
  it("drops the points when the source changes", () => {
    corners.forEach((c) => place(c));
    bindSource(1, 1000, 800, 1.2);
    expect(getState().corners).toHaveLength(4);
    bindSource(2, 1000, 800, 1.2);
    expect(getState().corners).toHaveLength(0);
  });
  it("warns about a small reference and a far span, and not otherwise", () => {
    corners.forEach((c) => place(c));
    place({ x: 100, y: 600 });
    place({ x: 900, y: 600 });
    const d = derive(getState());
    expect(d.problem).toBeNull();
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].text).toMatch(/ ± .* cm$/);
    expect(d.referenceWarnings).toHaveLength(0);
    expect(d.rows[0].warnings).toHaveLength(0);
    resetRuler();
    bindSource(3, 1000, 800, 1);
    [
      { x: 100, y: 100 },
      { x: 130, y: 100 },
      { x: 130, y: 123 },
      { x: 100, y: 123 },
    ].forEach((c) => place(c));
    place({ x: 100, y: 700 });
    place({ x: 900, y: 700 });
    const small = derive(getState());
    expect(small.referenceWarnings[0]).toMatch(/under 2%/);
    expect(small.rows[0].warnings[0]).toMatch(/10 times/);
  });
});
