/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Objects' boxes in metres. On a photo where the Ruler has put the depth map
// in metres (depth-metric.ts), each box the detector found gets a distance
// from the camera and a box size, each with its bar (measure/box-bars.ts),
// or the reason it has none. Nothing here runs a model or keeps state: it
// reads the one depth map the on-demand task made (object-measure.ts).
import { boxBars, type BarTerms, type Barred } from "../../measure/box-bars";
import {
  MAX_SPREAD,
  MIN_BOX_CELLS,
  REACH,
  boxEdges,
  sampleBox,
} from "../../measure/box-size";
import { formatMeasured } from "../../measure/format";
import { measured, type Measured } from "../../measure/noise";
import { depthAt } from "../../vision/depth/affine-fit";
import type { DepthExtra, Track } from "../../vision/types";
import {
  MAX_RELATIVE_BAR,
  MIN_RETAKES,
  floorSpan,
  type Retake,
} from "./depth-measured";
import type { DepthScale, MetricScale } from "./depth-metric";
import {
  REASONS,
  distanceBasis,
  heightBasis,
  widthBasis,
} from "./object-measure-text";

/** A box size, or why it has none. */
export type Sized = Measured | { refused: string };
export type BoxReading = { id: number; label: string } & (
  | { state: "pending" }
  | { state: "refused"; reason: string }
  | {
      state: "measured";
      distance: Measured;
      width: Sized;
      height: Sized;
      /** Depth-map cells the distance was read from. */
      cells: number;
      /** Their spread in depth, as a share of the median depth. */
      spread: number;
      /** What the distance's bar is made of, in metres. */
      terms: BarTerms;
    }
);
export type Measurement =
  | { metric: false; reason: string }
  | {
      metric: true;
      scale: MetricScale;
      /** Retakes of the Ruler's taps behind the bars; null until worked out. */
      retakes: number | null;
      boxes: BoxReading[];
    };

const metres = (b: Barred, basis: string) =>
  measured(b.value / 1000, b.error / 1000, "m", basis);
const tooWide = (b: Barred) => !(b.error <= MAX_RELATIVE_BAR * b.value);

function readBox(
  t: Track,
  extra: DepthExtra,
  scale: MetricScale,
  retakes: readonly Retake[] | null,
  side: number,
): BoxReading {
  const base = { id: t.id, label: t.label },
    refuse = (reason: string): BoxReading => ({
      ...base,
      state: "refused",
      reason,
    });
  // A held box is the tracker's guess at where a missed object went.
  if (t.held) return refuse(REASONS.held);
  const sample = sampleBox(extra, t.box),
    { fit } = scale;
  if (sample.cols < MIN_BOX_CELLS || sample.rows < MIN_BOX_CELLS)
    return refuse(REASONS.small(sample.cols, sample.rows, MIN_BOX_CELLS));
  if (!sample.inside) return refuse(REASONS.bars);
  const z = depthAt(fit, sample.median);
  if (z === null) return refuse(REASONS.far(REACH));
  // A larger output is nearer: the 84th percentile is the near side.
  const near = depthAt(fit, sample.high),
    far = depthAt(fit, sample.low),
    spread = near === null || far === null ? Infinity : (far - near) / 2 / z;
  if (spread > MAX_SPREAD) return refuse(REASONS.spread);
  if (z > REACH * fit.far) return refuse(REASONS.far(REACH));
  if (z < fit.near / REACH) return refuse(REASONS.near);
  if (!retakes) return { ...base, state: "pending" };
  if (retakes.length < MIN_RETAKES) return refuse(REASONS.retakes);
  const { w, h } = scale.s.source!,
    // One cell of the detector's input, in pixels of this picture.
    cell = { w: w / side, h: h / side },
    bars = boxBars({
      camera: scale.camera,
      edges: boxEdges(t.box, w, h, scale.flatten),
      z,
      output: sample.median,
      retakes,
      residual: fit.residual,
      spread,
      cell,
    });
  // A depth most retakes cannot place has no bar worth stating.
  if (bars.placed < 0.8 * retakes.length) return refuse(REASONS.retakes);
  if (tooWide(bars.distance)) return refuse(REASONS.bar("distance"));
  const span = z < fit.near || z > fit.far ? floorSpan(scale) : null,
    left = t.box.x * w,
    top = t.box.y * h,
    width: Sized =
      left <= cell.w || left + t.box.w * w >= w - cell.w
        ? { refused: REASONS.side }
        : tooWide(bars.width)
          ? { refused: REASONS.bar("width") }
          : metres(
              bars.width,
              widthBasis({ cell: cell.w, keystone: bars.keystone }),
            ),
    height: Sized =
      top <= cell.h || top + t.box.h * h >= h - cell.h
        ? { refused: REASONS.end }
        : !bars.height
          ? { refused: REASONS.plumb }
          : tooWide(bars.height)
            ? { refused: REASONS.bar("height") }
            : metres(bars.height, heightBasis({ cell: cell.h }));
  return {
    ...base,
    state: "measured",
    distance: metres(
      bars.distance,
      distanceBasis({
        cells: sample.cells,
        retakes: retakes.length,
        residual: fit.residual,
        spread,
        ...(span && span !== "pending"
          ? {
              beyond: {
                near: formatMeasured(span.near),
                far: formatMeasured(span.far),
              },
            }
          : {}),
      }),
    ),
    width,
    height,
    cells: sample.cells,
    spread,
    terms: Object.fromEntries(
      Object.entries(bars.distance.terms).map(([k, v]) => [k, v / 1000]),
    ) as BarTerms,
  };
}

/** Every track's reading against one depth map. `retakes` is null while the
 * Ruler's retakes are not worked out yet; `side` is the square the detector
 * resized the picture to. With no metric scale there is no number at all. */
export function measureTracks(
  tracks: readonly Track[],
  extra: DepthExtra,
  scale: DepthScale,
  retakes: readonly Retake[] | null,
  side: number,
): Measurement {
  if (!scale.metric) return { metric: false, reason: scale.reason };
  return {
    metric: true,
    scale,
    retakes: retakes?.length ?? null,
    boxes: tracks.map((t) => readBox(t, extra, scale, retakes, side)),
  };
}
