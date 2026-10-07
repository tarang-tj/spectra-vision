import { COLORS } from "../vision/types";
import type { EffectDef } from "./types";

const FINGERTIPS = [4, 8, 12, 16, 20];

/** Constellation: dims the source to a dark sky with a faint image-plane grid
 * so only the tracking geometry shines, and adds halos to fingertips. */
const constellation: EffectDef = {
  id: "constellation",
  label: "Constellation",
  modes: "*",
  kind: "2d",
  order: 20,
  create({ ctx }) {
    return {
      under(frame) {
        const { rect, width, height } = frame;
        ctx.fillStyle = "#060e18ee";
        ctx.fillRect(0, 0, width, height);
        // The map is static; all bright geometry above it comes from model outputs.
        ctx.strokeStyle = "#a4ffd912";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = rect.x; x <= rect.x + rect.w; x += 48) {
          ctx.moveTo(x, rect.y);
          ctx.lineTo(x, rect.y + rect.h);
        }
        for (let y = rect.y; y <= rect.y + rect.h; y += 48) {
          ctx.moveTo(rect.x, y);
          ctx.lineTo(rect.x + rect.w, y);
        }
        ctx.stroke();
      },
      // Halos sit on top of the hand that owns them and under the next hand.
      after(frame, kind, index) {
        if (kind !== "hand") return;
        const landmarks = frame.result?.tasks.hand?.landmarks[index];
        if (!landmarks?.[8]) return;
        const color = COLORS[index % COLORS.length];
        FINGERTIPS.forEach((tip) => {
          const p = landmarks[tip];
          if (!p) return;
          const q = frame.project(p),
            halo = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 38);
          halo.addColorStop(0, `${color}55`);
          halo.addColorStop(1, `${color}00`);
          ctx.fillStyle = halo;
          ctx.fillRect(q.x - 38, q.y - 38, 76, 76);
        });
      },
      draw() {},
      dispose() {},
    };
  },
};
export default constellation;
