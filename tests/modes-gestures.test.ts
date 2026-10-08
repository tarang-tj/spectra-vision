/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  GestureLog,
  HOLD,
  NO_GESTURE,
  gestureName,
} from "../src/modes/lib/gesture-log";

const at = { x: 0.5, y: 0.5 };
const hand = (name: string, handedness = "Left", x = 0.5) => ({
  name,
  handedness,
  at: { x, y: 0.5 },
});
const feed = (log: GestureLog, name: string, times: number) => {
  for (let i = 0; i < times; i++) log.update([hand(name)]);
};

describe("counting gestures", () => {
  it("counts a gesture once it has been held, not once per result", () => {
    const log = new GestureLog();
    feed(log, "Thumb_Up", HOLD - 1);
    expect(log.counts()).toEqual([]);
    feed(log, "Thumb_Up", 1);
    expect(log.counts()).toEqual([
      { name: "Thumb_Up", count: 1, at, active: true },
    ]);
    feed(log, "Thumb_Up", 40);
    expect(log.counts()[0].count).toBe(1);
  });
  it("counts it again only after the hand settled on something else", () => {
    const log = new GestureLog();
    feed(log, "Victory", HOLD);
    // A single odd result is not a new gesture.
    feed(log, NO_GESTURE, 1);
    feed(log, "Victory", HOLD);
    expect(log.counts()[0].count).toBe(1);
    feed(log, NO_GESTURE, HOLD);
    expect(log.counts()[0].active).toBe(false);
    feed(log, "Victory", HOLD);
    expect(log.counts()[0]).toMatchObject({ count: 2, active: true });
  });
  it("never lists the absence of a gesture", () => {
    const log = new GestureLog();
    feed(log, NO_GESTURE, HOLD * 3);
    expect(log.counts()).toEqual([]);
  });
  it("tracks two hands separately and sorts by count", () => {
    const log = new GestureLog();
    for (let i = 0; i < HOLD; i++)
      log.update([hand("Open_Palm", "Left"), hand("Closed_Fist", "Right")]);
    for (let i = 0; i < HOLD; i++)
      log.update([hand("Open_Palm", "Left"), hand(NO_GESTURE, "Right")]);
    for (let i = 0; i < HOLD; i++)
      log.update([hand("Open_Palm", "Left"), hand("Closed_Fist", "Right")]);
    expect(log.counts().map((c) => [c.name, c.count])).toEqual([
      ["Closed_Fist", 2],
      ["Open_Palm", 1],
    ]);
  });
  it("keeps two hands of the same handedness apart", () => {
    const log = new GestureLog();
    for (let i = 0; i < HOLD; i++)
      log.update([hand("Open_Palm", "Left"), hand("Thumb_Up", "Left")]);
    expect(
      log
        .counts()
        .map((c) => c.name)
        .sort(),
    ).toEqual(["Open_Palm", "Thumb_Up"]);
  });
  it("starts a hand over when it leaves the frame, and remembers where it was", () => {
    const log = new GestureLog();
    for (let i = 0; i < HOLD; i++) log.update([hand("Thumb_Up", "Left", 0.2)]);
    log.update([]);
    expect(log.counts()[0].active).toBe(false);
    for (let i = 0; i < HOLD; i++) log.update([hand("Thumb_Up", "Left", 0.8)]);
    expect(log.counts()[0]).toMatchObject({ count: 2, at: { x: 0.8, y: 0.5 } });
    log.reset();
    expect(log.counts()).toEqual([]);
  });
  it("gives model category names a readable form", () => {
    expect(gestureName("Open_Palm")).toBe("Open palm");
    expect(gestureName("ILoveYou")).toBe("I love you");
    expect(gestureName(NO_GESTURE)).toBe("No gesture");
    expect(gestureName("Custom_Wave")).toBe("Custom Wave");
  });
});
