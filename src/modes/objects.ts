import { taskStatus } from "../telemetry/task-status";
import { SHARPER_MODEL } from "../vision/detector/sharper";
import type { Frame } from "../vision/frame";
import { modelOf } from "../vision/settings";
import { COLORS, type TaskSpec } from "../vision/types";
import { finerFor, finerOption, finerText } from "./lib/finer";
import { drawChip } from "./lib/hud";
import { HELD, drawBox, drawnTracks, forgetDrawn } from "./lib/object-boxes";
import { objectControls } from "./lib/object-controls";
import { filterSummary, getFilter, shows } from "./lib/object-filter";
import type { ModeDef } from "./types";

const task: TaskSpec = {
  kind: "object",
  model: "efficientdet_lite0.tflite",
  preciseModel: "efficientdet_lite2.tflite",
  // On a real GPU the larger model runs by default (vision/model-choice.ts).
  // Measured on an Apple M3 through a camera: 11.9 results a second against
  // 14.4, and it holds a small vase at 60% that the smaller model scores
  // around its 45% gate.
  gpuModel: "efficientdet_lite2.tflite",
  // Sharper: a stronger detector on WebGPU, only when the person chooses it
  // (vision/detector/sharper.ts).
  sharpModel: SHARPER_MODEL,
  // From scripts/models.json; tests/vision-first-download.test.ts holds them
  // to it.
  sizes: {
    "efficientdet_lite0.tflite": 7_254_339,
    "efficientdet_lite2.tflite": 12_138_859,
    [SHARPER_MODEL]: 41_535_197,
  },
  options: { scoreThreshold: 0.1, maxResults: 20 },
  // Finer names (modes/lib/finer.ts): off unless the user turns it on.
  live: finerOption,
  delegate: "AUTO",
};

export const LOOKING = "Looking for objects…";
/** True between a moving source opening and its first result, once the model
 * is loaded: the stage's own loading line has gone and no box can be drawn. */
const looking = (frame: Frame) =>
  !frame.result &&
  !frame.paused &&
  (frame.source?.kind === "camera" || frame.source?.kind === "video") &&
  taskStatus(task.kind, modelOf(task))?.state === "ready";

const objects: ModeDef = {
  id: "objects",
  label: "Object detection",
  short: "Objects",
  order: 10,
  task,
  controls: objectControls(task),
  hint: "Switch to Hands. Pinch to paint.",
  demo: {
    still: "demo/studio.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio",
  },
  tracked: true,
  leave: forgetDrawn,
  // Tracked boxes with corner brackets and a label. A selected track dims the rest.
  drawBase(ctx, frame) {
    const { rect } = frame,
      filter = getFilter(),
      // A selected box whose class is hidden selects nothing, so the boxes
      // that are shown are not all dimmed for a row nobody can see.
      selected = frame.tracks.some(
        (t) => t.id === frame.settings.selected && !shows(t.label, filter),
      )
        ? null
        : frame.settings.selected;
    drawnTracks(frame).forEach((t, index) => {
      // A class the filter hides is not drawn. `index` stays the track's own,
      // which is what the effects look up.
      if (!shows(t.label, filter)) return;
      const opacity = selected === null || selected === t.id ? 1 : 0.32;
      ctx.save();
      ctx.globalAlpha = opacity;
      // Effects that belong under this track's box (its trail) draw here.
      frame.emit("before", "object", index);
      drawBox(ctx, frame, t, opacity);
      frame.emit("after", "object", index);
      ctx.restore();
    });
    // Say plainly that boxes are being hidden. Under the source badge at the
    // top left: the bottom corners hold the pause button and the stage tools.
    // Before the first result of a moving source the same place says that
    // the model is at work, where there would otherwise be bare video.
    const wait = looking(frame),
      note = wait ? LOOKING : filterSummary(filter);
    if (note)
      drawChip(
        ctx,
        frame,
        note,
        rect.x + 12,
        rect.y + 46,
        wait ? COLORS[0] : "#ffd18d",
      );
  },
  inspector: (frame) =>
    frame.tracks
      .filter((t) => shows(t.label))
      .map((t) => {
        const finer = finerFor(t);
        return {
          key: t.id,
          label: t.label,
          // A held track was missed by the latest result: it has no score.
          detail: `${t.held ? HELD : `${Math.round(t.score * 100)}%`}${finer ? ` · ${finerText(finer)}` : ""}`,
          point: { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 },
          color: COLORS[(t.id - 1) % COLORS.length],
        };
      }),
};
export default objects;
