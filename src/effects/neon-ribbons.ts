/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { ACCENTS } from "../gl/color";
import { smoothPath } from "../gl/maths";
import type { Point, VisionResult } from "../vision/types";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { createTrail, pushTrail, trimTrail } from "./lib/history";
import { handsOf, posesOf, span, visible } from "./lib/inputs";
import type { EffectDef } from "./types";

// Wrists and ankles of a body; the five fingertips of each of two hands.
const POSE_JOINTS = [15, 16, 27, 28],
  HAND_JOINTS = [4, 8, 12, 16, 20],
  SLOTS = POSE_JOINTS.length + 2 * HAND_JOINTS.length,
  CAPACITY = 40,
  STEPS = 4,
  // A ribbon shows this many seconds of measured motion.
  MAX_AGE = 2.2;

/** Neon ribbons: smooth light ribbons that follow chosen joints. A ribbon is
 * the joint's measured path over the last two seconds, smoothed with a
 * Catmull-Rom curve through the measured points. A still joint has no ribbon,
 * only the glow that marks it. */
const neonRibbons: EffectDef = {
  id: "neon-ribbons",
  label: "Neon ribbons",
  modes: ["body", "hands", "gestures", "fusion"],
  kind: "gl",
  order: 40,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "neon-ribbons", exposure: 1.2, bloom: 1.4 }, () => {
      const trails = Array.from({ length: SLOTS }, () => createTrail(CAPACITY)),
        widths = new Float32Array(SLOTS),
        live = new Uint8Array(SLOTS),
        curve = new Float32Array(CAPACITY * STEPS * 2);
      let seen: VisionResult | null = null;
      const follow = (
        slot: number,
        p: Point | undefined,
        ok: boolean,
        width: number,
        now: number,
      ) => {
        if (!p || !ok) return;
        live[slot] = 1;
        widths[slot] = width;
        pushTrail(trails[slot], p.x, p.y, now, 0.003);
      };
      return {
        paint(frame, kit, _level, clock) {
          const now = clock.live;
          if (frame.result && frame.result !== seen) {
            seen = frame.result;
            live.fill(0);
            const pose = posesOf(frame)[0],
              hands = handsOf(frame);
            if (pose && pose.length >= 33) {
              const width = span(frame, pose[11], pose[12]) * 0.11;
              POSE_JOINTS.forEach((joint, i) =>
                follow(i, pose[joint], visible(pose[joint]), width, now),
              );
            }
            for (let h = 0; h < Math.min(2, hands.length); h++) {
              const hand = hands[h];
              if (!hand || hand.length < 21) continue;
              const width = span(frame, hand[0], hand[9]) * 0.11;
              HAND_JOINTS.forEach((joint, i) =>
                follow(4 + h * 5 + i, hand[joint], true, width, now),
              );
            }
            // A joint the model lost starts a new ribbon when it returns.
            for (let s = 0; s < SLOTS; s++) if (!live[s]) trails[s].count = 0;
          }
          let drawn = 0;
          const { rect, mirror } = frame,
            lines = kit.lines;
          for (let s = 0; s < SLOTS; s++) {
            const trail = trails[s];
            trimTrail(trail, now, MAX_AGE);
            if (!trail.count) continue;
            const n = smoothPath(trail.xy, trail.count, STEPS, curve),
              color = ACCENTS[s % ACCENTS.length],
              width = Math.max(4, widths[s]);
            let x = 0,
              y = 0;
            const path = lines.path;
            for (let i = 0; i < n; i++) {
              // 0 at the tail, 1 at the joint: the ribbon tapers and fades.
              const t = n > 1 ? i / (n - 1) : 1;
              x = rect.x + (mirror ? 1 - curve[2 * i] : curve[2 * i]) * rect.w;
              y = rect.y + curve[2 * i + 1] * rect.h;
              path[i * 4] = x;
              path[i * 4 + 1] = y;
              path[i * 4 + 2] = width * (0.25 + 0.75 * t);
              path[i * 4 + 3] = t * t;
            }
            lines.strip(n, color);
            lines.dot(x, y, width * 1.1, color, 0.6);
            drawn++;
          }
          if (!drawn) return null;
          kit.flush(false, 0.6);
          return kit.scene;
        },
        reset() {
          for (const trail of trails) trail.count = 0;
          seen = null;
        },
        dispose() {},
      };
    }),
};
export default neonRibbons;
