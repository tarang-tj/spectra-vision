/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A server render runs no effects, so the effects each component registers are
// kept here and run by hand, as a mount would run them.
const kept = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  asked: [] as [string, string][],
}));

vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => void | (() => void)) => {
      kept.effects.push(effect);
    },
    useSyncExternalStore: <T>(_: unknown, read: () => T) => read(),
  };
});

vi.mock("../src/vision/camera-choice", async (original) => {
  const choice = await original<typeof import("../src/vision/camera-choice")>();
  return {
    ...choice,
    preferCamera: (owner: string, facing: "user" | "environment") => {
      kept.asked.push([owner, facing]);
      return choice.preferCamera(owner, facing);
    },
  };
});

import ruler from "../src/panels/ruler";
import RoomSection from "../src/panels/ruler/room/room-section";
import { StudioContext, type Studio } from "../src/studio-context";
import { preferredFacing, startWant } from "../src/vision/camera-choice";

const studio = {
  frame: { source: null },
  paused: false,
  setPaused() {},
  // Every stage hook takes a handler and hands back the function that
  // removes it.
  stage: new Proxy({}, { get: () => () => () => {} }),
} as unknown as Studio;

/** Render as the rail would, then run the effects of the mount. The returned
 * function runs their cleanups, as leaving the panel would. */
function mount(component: ComponentType<{ show: boolean }>): () => void {
  kept.effects.length = 0;
  renderToStaticMarkup(
    createElement(
      StudioContext.Provider,
      { value: studio },
      createElement(component, { show: false }),
    ),
  );
  const cleanups = kept.effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

beforeEach(() => {
  kept.asked.length = 0;
  // The panel asks what kind of element the picture is; Node has neither.
  vi.stubGlobal("HTMLVideoElement", class {});
  vi.stubGlobal("HTMLImageElement", class {});
});

describe("the measuring panels and the camera's side", () => {
  it("asks for the rear camera while the Ruler is on show", () => {
    expect(preferredFacing()).toBeNull();
    const leave = mount(ruler.Component as ComponentType<{ show: boolean }>);
    expect(kept.asked).toContainEqual(["ruler", "environment"]);
    expect(preferredFacing()).toBe("environment");
    leave();
    expect(preferredFacing()).toBeNull();
  });
  it("asks for the rear camera while the Room section is on show", () => {
    const leave = mount(RoomSection);
    expect(kept.asked).toEqual([["room", "environment"]]);
    expect(preferredFacing()).toBe("environment");
    leave();
    expect(preferredFacing()).toBeNull();
  });
  it("still gives way to a side the person chose", () => {
    const leave = mount(ruler.Component as ComponentType<{ show: boolean }>),
      remembered = { deviceId: "front-id", facing: "user" as const };
    expect(startWant(null, preferredFacing(), remembered)).toEqual({
      facing: "environment",
    });
    expect(
      startWant({ facing: "user" }, preferredFacing(), remembered),
    ).toEqual({ deviceId: "front-id", remembered: true, facing: "user" });
    leave();
  });
});
