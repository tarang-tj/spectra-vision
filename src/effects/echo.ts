/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { BLUE, LAVENDER, MINT, ramp } from "../gl/color";
import type { VisionResult } from "../vision/types";
import { captureFigures, createFigureSet, drawBones } from "./lib/figures";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { delayedIndex } from "./lib/history";
import type { EffectDef } from "./types";

// How far behind the live skeleton each ghost runs, in seconds.
const DELAYS = [0.12, 0.24, 0.38, 0.54, 0.72],
  RING = 40,
  STOPS = [MINT, BLUE, LAVENDER];

/** Echo: time-delayed ghost copies of the skeleton. Every ghost is a past
 * model result, shown exactly where the model placed it; nothing is
 * interpolated or invented. A still subject has its ghosts on top of it, a
 * moving one drags them behind. */
const echo: EffectDef = {
  id: "echo",
  label: "Echo",
  modes: ["body", "hands", "gestures", "fusion"],
  kind: "gl",
  order: 70,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "echo", exposure: 1.1, bloom: 1.3 }, () => {
      const ring = Array.from({ length: RING }, createFigureSet),
        times = new Float64Array(RING),
        color = [0, 0, 0] as [number, number, number];
      let head = 0,
        filled = 0,
        seen: VisionResult | null = null;
      return {
        paint(frame, kit, _level, clock) {
          // One snapshot per model result, dated on the effect's own clock.
          if (frame.result && frame.result !== seen) {
            seen = frame.result;
            captureFigures(frame, ring[head]);
            times[head] = clock.live;
            head = (head + 1) % RING;
            filled = Math.min(RING, filled + 1);
          }
          if (!frame.result || !filled) return null;
          let drawn = 0;
          // Oldest ghost first, so the nearer ones sit on top.
          for (let i = DELAYS.length - 1; i >= 0; i--) {
            const index = delayedIndex(
              times,
              head,
              filled,
              clock.live - DELAYS[i],
            );
            if (index < 0 || !ring[index].count) continue;
            const t = i / (DELAYS.length - 1);
            ramp(STOPS, t, color);
            drawBones(
              kit.lines,
              frame,
              ring[index],
              0.06 + 0.05 * t,
              color,
              0.62 - 0.3 * t,
            );
            drawn++;
          }
          if (!drawn) return null;
          kit.flush(false, 0.12);
          return kit.scene;
        },
        reset() {
          head = filled = 0;
          seen = null;
        },
        dispose() {},
      };
    }),
};
export default echo;
