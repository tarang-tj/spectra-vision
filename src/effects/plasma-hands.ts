/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { BLUE, LAVENDER, MINT } from "../gl/color";
import type { Rgb } from "../gl/color";
import type { LineBatch } from "../gl/lines";
import { arcOffset, clamp } from "../gl/maths";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { handsOf, px, py } from "./lib/inputs";
import type { EffectDef } from "./types";

const TIPS = [4, 8, 12, 16, 20],
  PALM = [0, 5, 9, 13, 17],
  STEPS = 28;

/** One crackling arc between two tracked points. It starts and ends exactly
 * on them (arcOffset is zero at both ends); only the path between flickers. */
function arc(
  lines: LineBatch,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  seed: number,
  time: number,
  width: number,
  color: Rgb,
  strength: number,
) {
  const dx = bx - ax,
    dy = by - ay,
    length = Math.hypot(dx, dy);
  if (length < 1 || strength <= 0) return;
  const nx = -dy / length,
    ny = dx / length,
    sway = length * 0.16 + 2;
  lines.ribbon();
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS,
      off = arcOffset(t, seed, time) * sway;
    lines.point(
      ax + dx * t + nx * off,
      ay + dy * t + ny * off,
      width * (0.55 + 0.45 * Math.sin(Math.PI * t)),
      color[0],
      color[1],
      color[2],
      strength,
    );
  }
}

/** Plasma hands: energy arcs between the fingertips of each hand and between
 * two palms. Arcs brighten as the measured points come closer together. */
const plasmaHands: EffectDef = {
  id: "plasma-hands",
  label: "Plasma hands",
  modes: ["hands", "gestures", "fusion"],
  kind: "gl",
  order: 30,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "plasma-hands", exposure: 1.25, bloom: 1.5 }, () => {
      // Fingertips, then the palm centre, of up to two hands, in CSS pixels.
      const tips = new Float32Array(2 * 12),
        sizes = new Float32Array(2);
      return {
        paint(frame, kit, _level, clock) {
          const hands = handsOf(frame),
            lines = kit.lines,
            count = Math.min(2, hands.length),
            time = clock.time;
          let found = 0;
          for (let h = 0; h < count; h++) {
            const points = hands[h];
            if (!points || points.length < 21) continue;
            const base = found * 12,
              size = Math.max(
                8,
                Math.hypot(
                  px(frame, points[0]) - px(frame, points[9]),
                  py(frame, points[0]) - py(frame, points[9]),
                ),
              );
            let cx = 0,
              cy = 0;
            for (let k = 0; k < 5; k++) {
              tips[base + 2 * k] = px(frame, points[TIPS[k]]);
              tips[base + 2 * k + 1] = py(frame, points[TIPS[k]]);
              cx += px(frame, points[PALM[k]]) / 5;
              cy += py(frame, points[PALM[k]]) / 5;
            }
            tips[base + 10] = cx;
            tips[base + 11] = cy;
            sizes[found] = size;
            // Neighbouring fingertips: two strands each, tighter is brighter.
            for (let k = 0; k < 4; k++) {
              const ax = tips[base + 2 * k],
                ay = tips[base + 2 * k + 1],
                bx = tips[base + 2 * k + 2],
                by = tips[base + 2 * k + 3],
                near = clamp(
                  1.3 - Math.hypot(bx - ax, by - ay) / (size * 1.4),
                  0.3,
                  1,
                ),
                seed = h * 20 + k;
              arc(lines, ax, ay, bx, by, seed, time, size * 0.085, BLUE, near);
              arc(
                lines,
                ax,
                ay,
                bx,
                by,
                seed + 7.3,
                time * 1.3,
                size * 0.05,
                LAVENDER,
                near * 0.7,
              );
            }
            for (let k = 0; k < 5; k++)
              lines.dot(
                tips[base + 2 * k],
                tips[base + 2 * k + 1],
                size * 0.2,
                MINT[0],
                MINT[1],
                MINT[2],
                0.8,
              );
            found++;
          }
          if (!found) return null;
          if (found === 2) {
            // Palm to palm, and each fingertip to its twin on the other hand.
            const size = (sizes[0] + sizes[1]) / 2,
              gap = Math.hypot(tips[22] - tips[10], tips[23] - tips[11]),
              near = clamp(1.35 - gap / (frame.rect.h * 0.9), 0.3, 1);
            for (let s = 0; s < 3; s++)
              arc(
                lines,
                tips[10],
                tips[11],
                tips[22],
                tips[23],
                50 + s * 3.7,
                time * (1 + s * 0.2),
                size * (0.14 - s * 0.03),
                s === 0 ? MINT : LAVENDER,
                near,
              );
            for (let k = 0; k < 5; k++)
              arc(
                lines,
                tips[2 * k],
                tips[2 * k + 1],
                tips[12 + 2 * k],
                tips[13 + 2 * k],
                70 + k,
                time * 0.9,
                size * 0.06,
                BLUE,
                near * 0.55,
              );
            for (let h = 0; h < 2; h++)
              lines.dot(
                tips[h * 12 + 10],
                tips[h * 12 + 11],
                size * (0.5 + 0.5 * near),
                LAVENDER[0],
                LAVENDER[1],
                LAVENDER[2],
                0.5 * near,
              );
          }
          kit.flush(false, 0.7);
          return kit.scene;
        },
        dispose() {},
      };
    }),
};
export default plasmaHands;
