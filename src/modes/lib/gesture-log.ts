/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Point } from "../../vision/types";

// Counts how often each gesture was made. A gesture is counted once when a
// hand has held it for HOLD model results in a row, and again only after that
// hand has settled on something else (another gesture, or none). Counting
// results instead would make the number depend on the frame rate. Pure: no
// DOM, no clock, so it is unit-tested.

export const NO_GESTURE = "None";
/** Model results a gesture must last before it counts (about 0.2 s at 15 fps). */
export const HOLD = 3;

export type GestureSighting = { name: string; handedness: string; at: Point };
export type GestureCount = {
  name: string;
  count: number;
  /** Where the hand was the last time the gesture was counted or held. */
  at: Point;
  /** True while some hand is holding it. */
  active: boolean;
};
type HandState = { candidate: string; streak: number; settled: string };

const NAMES: Record<string, string> = {
  None: "No gesture",
  Closed_Fist: "Closed fist",
  Open_Palm: "Open palm",
  Pointing_Up: "Pointing up",
  Thumb_Down: "Thumb down",
  Thumb_Up: "Thumb up",
  Victory: "Victory",
  ILoveYou: "I love you",
};
/** A readable name for a model category; unknown names lose their underscores. */
export const gestureName = (name: string) =>
  NAMES[name] ?? name.replace(/_/g, " ");

export class GestureLog {
  private hands = new Map<string, HandState>();
  private seen = new Map<string, GestureCount>();

  reset() {
    this.hands.clear();
    this.seen.clear();
  }

  /** Feed the hands of one model result. */
  update(sightings: GestureSighting[]) {
    const present = new Set<string>(),
      holding = new Set<string>();
    sightings.forEach((sighting) => {
      // Hand order is not stable between results, handedness mostly is. Two
      // hands of the same handedness are told apart by their order.
      let key = sighting.handedness;
      while (present.has(key)) key += "+";
      present.add(key);
      const hand = this.hands.get(key) ?? {
        candidate: "",
        streak: 0,
        settled: NO_GESTURE,
      };
      this.hands.set(key, hand);
      if (sighting.name === hand.candidate) hand.streak++;
      else {
        hand.candidate = sighting.name;
        hand.streak = 1;
      }
      if (hand.streak >= HOLD && hand.candidate !== hand.settled) {
        hand.settled = hand.candidate;
        if (hand.settled !== NO_GESTURE) this.count(hand.settled, sighting.at);
      }
      if (hand.settled !== NO_GESTURE && hand.settled === sighting.name) {
        holding.add(hand.settled);
        const entry = this.seen.get(hand.settled);
        if (entry) entry.at = sighting.at;
      }
    });
    // A hand that left the frame starts over when it comes back.
    for (const key of this.hands.keys())
      if (!present.has(key)) this.hands.delete(key);
    for (const entry of this.seen.values())
      entry.active = holding.has(entry.name);
  }

  /** Gestures seen so far, most frequent first. */
  counts(): GestureCount[] {
    return [...this.seen.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
  }

  private count(name: string, at: Point) {
    const entry = this.seen.get(name);
    if (entry) entry.count++;
    else this.seen.set(name, { name, count: 1, at, active: true });
  }
}
