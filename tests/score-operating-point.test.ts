/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  SHARPER_FLOOR,
  found,
  gateFor,
  pointOf,
  right,
} from "../src/panels/lab/scorecard/operating-point";
import type { Label, Scored } from "../src/panels/lab/scorecard/match";

const at = (x: number, y = 0, w = 10, h = 10) => ({ x, y, w, h });
const label = (name: string, box: Label["box"], crowd = false): Label => ({
  label: name,
  box,
  crowd,
});
const scored = (name: string, score: number, box: Scored["box"]): Scored => ({
  label: name,
  score,
  box,
});

describe("gateFor", () => {
  it("is the Confidence value, and never under 0.45 for Sharper", () => {
    expect(SHARPER_FLOOR).toBe(0.45);
    expect(gateFor(0.3, false)).toBe(0.3);
    expect(gateFor(0.3, true)).toBe(0.45);
    expect(gateFor(0.6, true)).toBe(0.6);
    expect(gateFor(0.6, false)).toBe(0.6);
  });
});

describe("pointOf", () => {
  it("counts hits, misses and false boxes among the boxes at or above the gate", () => {
    const point = pointOf(
      [
        scored("cup", 0.9, at(0)),
        scored("cup", 0.5, at(300)), // exactly at the gate: kept, and false
        scored("fork", 0.49, at(100)), // under the gate: its label is a miss
      ],
      [label("cup", at(0)), label("fork", at(100))],
      0.5,
    );
    expect([point.hits, point.misses, point.falses]).toEqual([1, 1, 1]);
    expect(point.items.map((item) => item.kind)).toEqual([
      "hit",
      "false",
      "miss",
    ]);
    expect(point.items[0]).toMatchObject({
      label: "cup",
      score: 0.9,
      overlap: 1,
    });
    expect(point.items[2]).toMatchObject({ label: "fork", box: at(100) });
    expect(point.byClass.get("cup")).toEqual({ hits: 1, misses: 0, falses: 1 });
    expect(point.byClass.get("fork")).toEqual({
      hits: 0,
      misses: 1,
      falses: 0,
    });
  });
  it("counts the boxes of a class with no label as false", () => {
    const point = pointOf(
      [scored("vase", 0.9, at(300))],
      [label("cup", at(0))],
      0.3,
    );
    expect([point.hits, point.misses, point.falses]).toEqual([0, 1, 1]);
  });
  it("names the three kinds of false box", () => {
    const labels = [label("bowl", at(0)), label("cup", at(100))];
    const point = pointOf(
      [
        scored("cup", 0.9, at(100)), // hit
        scored("cup", 0.8, at(101)), // the cup again
        scored("vase", 0.7, at(0)), // on the bowl, under another name
        scored("vase", 0.6, at(500)), // on nothing
        scored("cup", 0.55, at(3)), // a cup drawn on the bowl
      ],
      labels,
      0.5,
    );
    const falses = point.items.filter((item) => item.kind === "false");
    expect(falses.map((item) => item.kind === "false" && item.why)).toEqual([
      "second box",
      "wrong name",
      "nothing",
      "wrong name",
    ]);
    expect(falses[1]).toMatchObject({ labelled: "bowl" });
    expect(falses[3]).toMatchObject({ labelled: "bowl" });
    expect(falses[2]).not.toHaveProperty("labelled");
  });
  it("sets a box on a crowd region aside: not a hit, not false, and the region is no miss", () => {
    const point = pointOf(
      [scored("book", 0.9, at(410, 410))],
      [label("book", at(400, 400, 300, 300), true)],
      0.5,
    );
    expect([point.hits, point.misses, point.falses, point.ignored]).toEqual([
      0, 0, 0, 1,
    ]);
    expect(point.items.map((item) => item.kind)).toEqual(["ignored"]);
  });
});

describe("found and right", () => {
  const none = pointOf([], [label("cup", at(0))], 0.5),
    empty = pointOf([], [], 0.5),
    hit = pointOf([scored("cup", 0.9, at(0))], [label("cup", at(0))], 0.5),
    wrong = pointOf([scored("cup", 0.9, at(300))], [label("cup", at(0))], 0.5);
  it("is hits over labelled objects, and hits over boxes kept", () => {
    expect(found([hit, wrong, none])).toBeCloseTo(1 / 3, 12);
    expect(right([hit, wrong, none])).toBe(0.5);
  });
  it("with no boxes: Found is 0 and Right is not a number, not 0 or 100", () => {
    expect(found([none])).toBe(0);
    expect(right([none])).toBeNull();
    expect(found([empty])).toBeNull();
  });
  it("weights whole pictures", () => {
    expect(found([hit, wrong], [3, 1])).toBe(0.75);
    expect(right([hit, wrong], [0, 1])).toBe(0);
    expect(right([hit, wrong], [0, 0])).toBeNull();
  });
  it("can be asked for one class", () => {
    const mixed = pointOf(
      [scored("cup", 0.9, at(0))],
      [label("cup", at(0)), label("fork", at(100))],
      0.5,
    );
    expect(found([mixed], undefined, "cup")).toBe(1);
    expect(found([mixed], undefined, "fork")).toBe(0);
    expect(found([mixed], undefined, "vase")).toBeNull();
  });
});
