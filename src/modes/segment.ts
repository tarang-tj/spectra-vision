/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { drawChip } from "./lib/hud";
import { classInfo, segmentLayers } from "./lib/segment-layers";
import { segmentExtra } from "./lib/task-extras";
import type { ModeDef } from "./types";

// Inspector row keys are class index + 1, so the selected row names the class
// whose cutout is shown.
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

const segment: ModeDef = {
  id: "segment",
  label: "Segmentation",
  short: "Segment",
  order: 50,
  task: {
    kind: "segment",
    model: "selfie_multiclass_256x256.tflite",
    options: { outputCategoryMask: false, outputConfidenceMasks: true },
    // This model is about nine times faster on a real GPU than on CPU. The
    // worker refuses a software-rendered GPU, and the page then restarts the
    // task on CPU, so the delegate shown is always the one that ran.
    delegate: "GPU",
  },
  hint: "Select a class to tint it. Select Background to blur it.",
  demo: {
    // A crop of the generated demo studio image, framed like a selfie, which
    // is what this model is trained on. No real person is shown.
    still: "demo/face.png",
    motion: "demo/studio-motion.mp4",
    label: "Demo studio · portrait crop",
  },
  // Cutouts from the measured mask. Nothing selected: the person isolated on
  // the dark stage. Background selected: the background blurred instead. Any
  // other class selected: that class tinted. The silhouette outline is always on.
  drawBase(ctx, frame) {
    const seg = segmentExtra(frame.result?.tasks.segment);
    if (!seg) return;
    const selected = frame.settings.selected,
      picked =
        selected !== null && seg.classes[selected - 1]?.pixels
          ? selected - 1
          : null,
      blur = picked === seg.background,
      tint = blur ? null : picked;
    const layers = segmentLayers(
        seg,
        { tint, blur },
        frame.source?.element ?? null,
      ),
      { rect } = frame;
    frame.emit("before", "segment", 0);
    ctx.save();
    // The masks are in image space: flip them with the image when mirrored.
    if (frame.mirror) {
      ctx.translate(frame.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(layers.cover, rect.x, rect.y, rect.w, rect.h);
    ctx.drawImage(layers.outline, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    if (tint !== null) {
      const picked = seg.classes[tint],
        info = classInfo(picked.label),
        box = picked.box,
        corner = frame.project({
          x: frame.mirror ? box.x + box.w : box.x,
          y: box.y,
        });
      drawChip(
        ctx,
        frame,
        `${info.name}  ${percent(picked.share)}`,
        corner.x,
        corner.y - 25,
        info.color,
      );
    }
    frame.emit("after", "segment", 0);
  },
  // Per-class share of the mask's pixels. Background is always listed; the
  // Confidence slider hides classes the model was less sure about.
  inspector(frame) {
    const seg = segmentExtra(frame.result?.tasks.segment);
    if (!seg) return [];
    return seg.classes.flatMap((entry, i) => {
      if (!entry.pixels) return [];
      if (i !== seg.background && entry.score < frame.settings.confidence)
        return [];
      const info = classInfo(entry.label);
      return [
        {
          key: i + 1,
          label: info.name,
          detail: percent(entry.share),
          point: {
            x: entry.box.x + entry.box.w / 2,
            y: entry.box.y + entry.box.h / 2,
          },
          color: info.color,
        },
      ];
    });
  },
};
export default segment;
