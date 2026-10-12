/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  choiceText,
  flipWant,
  hasSides,
  parseChoice,
  preferCamera,
  preferredFacing,
  startWant,
} from "../src/vision/camera-choice";
import { cameraList } from "../src/vision/camera-devices";
import type { Granted } from "../src/vision/camera-start";

const BACK: Granted = {
  deviceId: "back-id",
  label: "Back Camera",
  facing: "environment",
  width: 720,
  height: 1280,
  frameRate: 30,
};

describe("the remembered camera", () => {
  it("round-trips an id and a side", () => {
    expect(parseChoice(choiceText(BACK))).toEqual({
      deviceId: "back-id",
      facing: "environment",
    });
  });
  it("keeps only what it knows", () => {
    expect(
      parseChoice(choiceText({ deviceId: "", facing: "environment" })),
    ).toEqual({ facing: "environment" });
    expect(
      parseChoice(choiceText({ deviceId: "x", facing: "unknown" })),
    ).toEqual({ deviceId: "x" });
    expect(parseChoice(choiceText({ deviceId: "", facing: "unknown" }))).toBe(
      null,
    );
  });
  it("reads anything else as no choice", () => {
    for (const text of [null, "", "{", "null", "7", '"back"', "[]"])
      expect(parseChoice(text)).toBeNull();
    expect(parseChoice('{"deviceId":5,"facing":"sideways"}')).toBeNull();
  });

  describe("across a reload", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      });
    });
    afterEach(() => vi.unstubAllGlobals());
    // A fresh copy of the module is a fresh page: nothing held in memory.
    const page = async () => {
      vi.resetModules();
      return import("../src/vision/camera-choice");
    };
    it("is still there on the next visit", async () => {
      const first = await page();
      expect(first.readChoice()).toBeNull();
      first.writeChoice(BACK);
      expect(first.readChoice()).toEqual({
        deviceId: "back-id",
        facing: "environment",
      });
      expect((await page()).readChoice()).toEqual({
        deviceId: "back-id",
        facing: "environment",
      });
    });
    it("carries on without storage", async () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      });
      const blocked = await page();
      expect(blocked.readChoice()).toBeNull();
      expect(() => blocked.writeChoice(BACK)).not.toThrow();
    });
  });
});

describe("what Start camera asks for", () => {
  const remembered = { deviceId: "back-id", facing: "environment" as const };
  it("asks for nothing in particular on a first visit", () => {
    expect(startWant(null, null, null)).toEqual({});
  });
  it("asks for the remembered camera, and says it is a remembered one", () => {
    expect(startWant(null, null, remembered)).toEqual({
      deviceId: "back-id",
      facing: "environment",
      remembered: true,
    });
    expect(startWant(null, null, { deviceId: "webcam" })).toEqual({
      deviceId: "webcam",
      remembered: true,
    });
  });
  it("lets a side picked by hand overrule the remembered camera", () => {
    expect(startWant({ facing: "user" }, null, remembered)).toEqual({
      facing: "user",
    });
    expect(startWant({ facing: "environment" }, null, remembered)).toEqual({
      deviceId: "back-id",
      facing: "environment",
      remembered: true,
    });
  });
  it("lets a panel's side overrule the remembered one, but not a pick", () => {
    const front = { deviceId: "front-id", facing: "user" as const };
    expect(startWant(null, "environment", front)).toEqual({
      facing: "environment",
    });
    expect(startWant({ facing: "user" }, "environment", front)).toEqual({
      deviceId: "front-id",
      facing: "user",
      remembered: true,
    });
  });
  it("asks for a camera picked by name as it is", () => {
    expect(startWant({ deviceId: "wide" }, "environment", remembered)).toEqual({
      deviceId: "wide",
    });
  });
});

describe("a panel's preferred side", () => {
  it("stands while the panel is on show and is withdrawn after", () => {
    expect(preferredFacing()).toBeNull();
    const done = preferCamera("ruler", "environment");
    expect(preferredFacing()).toBe("environment");
    done();
    expect(preferredFacing()).toBeNull();
  });
});

describe("the Flip tool", () => {
  it("goes to the other side when the camera says which way it faces", () => {
    expect(flipWant(BACK, ["front-id", "back-id"])).toEqual({
      facing: "user",
      previousId: "back-id",
    });
    expect(flipWant({ deviceId: "f", facing: "user" }, [])).toEqual({
      facing: "environment",
      previousId: "f",
    });
  });
  it("goes round the list when it does not", () => {
    const at = (id: string) =>
      flipWant({ deviceId: id, facing: "unknown" }, ["a", "b", "c"]);
    expect(at("a")).toEqual({ deviceId: "b", previousId: "a" });
    expect(at("c")).toEqual({ deviceId: "a", previousId: "c" });
  });
  it("has nowhere to go with one webcam", () => {
    expect(flipWant({ deviceId: "a", facing: "unknown" }, ["a"])).toBeNull();
    expect(flipWant({ deviceId: "a", facing: "unknown" }, ["", ""])).toBeNull();
  });
});

describe("the list of cameras", () => {
  const input = (deviceId: string, label: string, kind = "videoinput") =>
    ({ deviceId, label, kind }) as MediaDeviceInfo;
  it("counts unnamed cameras but lists only the ones that can be asked for", () => {
    // What a browser gives before permission: one camera, no id, no name.
    expect(cameraList([input("", ""), input("", "", "audioinput")])).toEqual({
      count: 1,
      named: [],
    });
  });
  it("names a camera the browser left unnamed", () => {
    expect(
      cameraList([
        input("mic", "Microphone", "audioinput"),
        input("a", "Front Camera"),
        input("b", ""),
      ]),
    ).toEqual({
      count: 2,
      named: [
        { deviceId: "a", label: "Front Camera" },
        { deviceId: "b", label: "Camera 2" },
      ],
    });
  });
  it("offers Front and Rear on a phone, and on a desk only when a camera has a side", () => {
    expect(hasSides(true, 1, [])).toBe(true);
    expect(hasSides(false, 2, ["unknown", "environment"])).toBe(true);
    expect(hasSides(false, 2, ["unknown", "unknown"])).toBe(false);
    expect(hasSides(false, 1, ["user"])).toBe(false);
  });
});
