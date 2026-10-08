/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Where a game gets its landmarks, and the test hook `window.__spectraGames`.
// Games normally read the model's latest result. An automated test can inject
// synthetic landmarks instead, to prove scoring without a person in front of
// the camera; while it does, the stage says so in a visible badge.
import type { SynthStats } from "../../audio/synth";
import { isMuted, setMuted } from "../../audio/synth";
import type { Frame } from "../../vision/frame";
import type { Point, TaskKind } from "../../vision/types";

/** The landmarks one game frame is played with. Reused, never kept. */
export type Input = {
  landmarks: Point[][];
  handedness: string[];
  /** Ms timestamp of this input. It changes when new landmarks arrive. */
  time: number;
  synthetic: boolean;
};
export const createInput = (): Input => ({
  landmarks: [],
  handedness: [],
  time: 0,
  synthetic: false,
});

/** What the running game exposes to the hook. */
export type ActiveGame = {
  id: string;
  snapshot(): Record<string, unknown>;
  audio(): SynthStats;
};
export type GameOptions = {
  roundMs?: number;
  countdownMs?: number;
  seed?: number;
};

const NONE: Point[][] = [],
  NO_NAMES: string[] = [];
let injected: Input | null = null,
  active: ActiveGame | null = null;
/** Round settings a test may shorten. Empty in normal use. */
export const options: GameOptions = {};
/** Totals since page load, for checking that nothing runs when it should not. */
export const counters = { updates: 0, draws: 0, created: 0, disposed: 0 };

/** Fill `out` with the landmarks to play this frame with. */
export function readInput(frame: Frame, kind: TaskKind, out: Input) {
  if (injected) {
    out.landmarks = injected.landmarks;
    out.handedness = injected.handedness;
    out.time = injected.time;
    out.synthetic = true;
    return out;
  }
  const task = frame.result?.tasks[kind];
  out.landmarks = task?.landmarks ?? NONE;
  out.handedness = task?.handedness ?? NO_NAMES;
  out.time = task?.time ?? 0;
  out.synthetic = false;
  return out;
}

export function setActive(game: ActiveGame | null) {
  active = game;
  // Synthetic input never outlives the game it was injected into.
  if (!game) injected = null;
}

export type GamesHook = {
  /** Play with these landmarks (image coordinates, 0..1) in place of the
   * model's until `inject(null)`. One array of points per hand or body. */
  inject(landmarks: Point[][] | null, handedness?: string[]): void;
  /** The running game's id and full state, or null when none is running. */
  state(): Record<string, unknown> | null;
  /** The running game's synthesizer: context state, sounds played, live nodes. */
  audio(): SynthStats | null;
  /** Update, draw, create and dispose totals since page load. */
  counters(): typeof counters;
  /** Shorten the round or fix the random seed. Applies from the next start. */
  configure(next: GameOptions): void;
  mute(value: boolean): void;
};

const hook: GamesHook = {
  inject(landmarks, handedness) {
    injected = landmarks && {
      landmarks,
      handedness: handedness ?? landmarks.map((_, i) => (i ? "Right" : "Left")),
      time: performance.now(),
      synthetic: true,
    };
  },
  state: () =>
    active && {
      id: active.id,
      synthetic: !!injected,
      muted: isMuted(),
      ...active.snapshot(),
    },
  audio: () => active?.audio() ?? null,
  counters: () => ({ ...counters }),
  configure: (next) => void Object.assign(options, next),
  mute: setMuted,
};

declare global {
  interface Window {
    __spectraGames?: GamesHook;
  }
}
if (typeof window !== "undefined") window.__spectraGames = hook;
