/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// The games' sound effects, each built from a few synthesized tones.
import { midiToHz } from "../games/lib/music-logic";
import type { Synth } from "./synth";

export type Sfx = ReturnType<typeof createSfx>;

export function createSfx(synth: Synth) {
  return {
    /** Countdown 3, 2, 1. */
    tick: () => synth.tone({ from: 520, duration: 0.12, gain: 0.25 }),
    go: () => synth.tone({ from: 1040, duration: 0.3, gain: 0.3 }),
    /** A hit. The pitch climbs with the combo so a streak can be heard. */
    hit(combo: number) {
      const hz = midiToHz(72 + Math.min(12, combo));
      synth.tone({ type: "triangle", from: hz, duration: 0.16, gain: 0.3 });
      synth.tone({ from: hz * 2, duration: 0.09, gain: 0.12 });
    },
    /** The swish of a blade through an orb. */
    slice: () => synth.noise(0.12, 0.25, 5200),
    miss: () =>
      synth.tone({
        type: "sawtooth",
        from: 190,
        to: 90,
        duration: 0.28,
        gain: 0.16,
      }),
    /** A pose locked in: a rising three-note chord. */
    lock() {
      [76, 80, 83].forEach((midi, i) =>
        synth.tone({
          type: "triangle",
          from: midiToHz(midi),
          duration: 0.3,
          gain: 0.22,
          delay: i * 0.06,
        }),
      );
    },
    /** A kick drum: a falling sine thump with a short noise click. */
    drum() {
      synth.tone({ from: 160, to: 45, duration: 0.24, gain: 0.6 });
      synth.noise(0.05, 0.2, 2400);
    },
    /** Round over. */
    end() {
      [69, 73, 76, 81].forEach((midi, i) =>
        synth.tone({
          type: "triangle",
          from: midiToHz(midi),
          duration: 0.4,
          gain: 0.22,
          delay: i * 0.11,
        }),
      );
    },
  };
}
