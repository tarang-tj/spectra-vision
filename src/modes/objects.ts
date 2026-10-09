import { COLORS } from "../vision/types";
import { finerFor, finerOption, finerText } from "./lib/finer";
import FinerSetting from "./lib/finer-setting";
import { drawChip } from "./lib/hud";
import { filterSummary, getFilter, shows } from "./lib/object-filter";
import type { ModeDef } from "./types";

const objects: ModeDef = {
  id: "objects",
  label: "Object detection",
  short: "Objects",
  order: 10,
  task: {
    kind: "object",
    model: "efficientdet_lite0.tflite",
    preciseModel: "efficientdet_lite2.tflite",
    options: { scoreThreshold: 0.1, maxResults: 20 },
    // Finer names (modes/lib/finer.ts): off unless the user turns it on.
    live: finerOption,
    delegate: "AUTO",
  },
  controls: FinerSetting,
  hint: "Switch to Hands. Pinch to paint.",
  demo: {
    still: "demo/studio.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio",
  },
  tracked: true,
  // Tracked boxes with corner brackets and a label. A selected track dims the rest.
  drawBase(ctx, frame) {
    const { rect, mirror } = frame,
      selected = frame.settings.selected,
      filter = getFilter(),
      detections = frame.result?.detections ?? [];
    frame.tracks.forEach((t, index) => {
      // A class the filter hides is not drawn. `index` stays the track's own,
      // which is what the effects look up.
      if (!shows(t.label, filter)) return;
      const color = COLORS[(t.id - 1) % COLORS.length],
        b = t.box,
        q = frame.project({ x: mirror ? b.x + b.w : b.x, y: b.y }),
        w = b.w * rect.w,
        h = b.h * rect.h;
      const opacity = selected === null || selected === t.id ? 1 : 0.32;
      ctx.save();
      ctx.globalAlpha = opacity;
      // Effects that belong under this track's box (its trail) draw here.
      frame.emit("before", "object", index);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = opacity * 0.55;
      ctx.strokeRect(q.x, q.y, w, h);
      ctx.globalAlpha = opacity;
      ctx.lineWidth = 2.5;
      const c = Math.min(20, w / 4, h / 4);
      ctx.beginPath();
      [
        [q.x, q.y, 1, 1],
        [q.x + w, q.y, -1, 1],
        [q.x, q.y + h, 1, -1],
        [q.x + w, q.y + h, -1, -1],
      ].forEach(([x, y, sx, sy]) => {
        ctx.moveTo(x + c * sx, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + c * sy);
      });
      ctx.stroke();
      const finer = finerFor(t, detections),
        label = `${t.label}  ${(t.score * 100).toFixed(0)}% · ${finer ? `${finerText(finer)} · ` : ""}${String(t.id).padStart(2, "0")}`;
      ctx.font = "600 12px Inter Variable, sans-serif";
      const tw = ctx.measureText(label).width + 14,
        lx = Math.min(Math.max(q.x, rect.x), rect.x + rect.w - tw),
        ly = Math.max(rect.y + 8, q.y - 25);
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly, tw, 23);
      ctx.fillStyle = "#07130e";
      ctx.fillText(label, lx + 7, ly + 16);
      frame.emit("after", "object", index);
      ctx.restore();
    });
    // Say plainly that boxes are being hidden.
    const note = filterSummary(filter);
    if (note)
      drawChip(ctx, frame, note, rect.x + 8, rect.y + rect.h - 40, "#ffd18d");
  },
  inspector: (frame) =>
    frame.tracks
      .filter((t) => shows(t.label))
      .map((t) => {
        const finer = finerFor(t, frame.result?.detections ?? []);
        return {
          key: t.id,
          label: t.label,
          detail: `${Math.round(t.score * 100)}%${finer ? ` · ${finerText(finer)}` : ""}`,
          point: { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 },
          color: COLORS[(t.id - 1) % COLORS.length],
        };
      }),
};
export default objects;
