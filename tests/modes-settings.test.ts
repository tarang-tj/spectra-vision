/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_PEOPLE,
  getPeople,
  onPeopleChange,
  parsePeople,
  peopleOption,
  resetPeople,
  setPeople,
} from "../src/modes/lib/people";
import {
  finerOption,
  finerOn,
  resetFiner,
  setFiner,
  FINER_FLOOR,
} from "../src/modes/lib/finer";
import { modes, tasksOf } from "../src/modes";

describe("People", () => {
  beforeEach(() => {
    resetPeople();
    setPeople(1);
  });
  it("is one by default and only ever a whole number from 1 to the ceiling", () => {
    expect(parsePeople(null)).toBe(1);
    for (const bad of ["0", "5", "1.5", "two", "", "-1"])
      expect(parsePeople(bad)).toBe(1);
    expect(parsePeople(String(MAX_PEOPLE))).toBe(MAX_PEOPLE);
    expect(peopleOption.current()).toEqual({ numPoses: 1 });
  });
  it("tells listeners on a change only", () => {
    let calls = 0;
    const off = onPeopleChange(() => calls++);
    setPeople(1);
    expect(calls).toBe(0);
    setPeople(2);
    expect(peopleOption.current()).toEqual({ numPoses: 2 });
    setPeople(99);
    expect(getPeople()).toBe(1);
    expect(calls).toBe(2);
    off();
  });
});

describe("Finer names", () => {
  beforeEach(() => {
    resetFiner();
    setFiner(false);
  });
  it("is off by default and then asks for no classifier at all", () => {
    expect(finerOn()).toBe(false);
    expect(finerOption.current()).toEqual({ finer: null });
  });
  it("on, asks for the classifier with its floor and limits", () => {
    setFiner(true);
    expect(finerOption.current().finer).toMatchObject({
      model: "efficientnet_lite0.tflite",
      floor: FINER_FLOOR,
      perPass: 3,
      everyMs: 1000,
    });
  });
});

describe("what the modes ask for", () => {
  const spec = (id: string) => tasksOf(modes.find((m) => m.id === id)!);
  it("uses the automatic delegate where the GPU was measured faster, CPU for Face", () => {
    for (const id of ["objects", "body", "hands", "gestures", "segment"])
      expect(spec(id)[0].delegate, id).toBe("AUTO");
    expect(spec("face")[0].delegate).toBe("CPU");
    expect(spec("fusion").map((t) => t.delegate)).toEqual([
      "AUTO",
      "AUTO",
      "CPU",
    ]);
  });
  it("follows one person in Body by default and always in Fusion", () => {
    expect(spec("body")[0].live?.current()).toEqual({ numPoses: 1 });
    expect(spec("body")[0].options.numPoses).toBe(1);
    expect(spec("fusion")[0].live).toBeUndefined();
    expect(spec("fusion")[0].options.numPoses).toBe(1);
  });
  it("offers Precise Objects with the larger detector", () => {
    expect(spec("objects")[0].preciseModel).toBe("efficientdet_lite2.tflite");
  });
});
