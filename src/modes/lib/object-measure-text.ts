/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Every word Measure objects shows: the piece on a box's label, the piece on
// its Inspect row, why a box or one of its sizes is not measured, what each
// number rests on, and the session export. A size is always "box ... wide"
// or "box ... tall": it is the detector's box at the object's distance, not
// the object's outline.
import { FOOT_SHARE, OFF_FLOOR_ALLOWANCE, REACH } from "../../measure/box-size";
import { formatMeasured } from "../../measure/format";
import type { Measured } from "../../measure/noise";
import type { BoxReading, Measurement, Sized } from "./object-measured";

const ALLOWANCE = `${Math.round(OFF_FLOOR_ALLOWANCE * 100)}%`;
const share = (value: number) => `${(value * 100).toFixed(1)}%`;

export const WORKING = "working out the error";
/** Why a box, or one of its sizes, has no number. Shown inside "not measured
 * (...)" on the page and as they are in the export. */
export const REASONS = {
  held: "the latest result did not find this box",
  small: (cols: number, rows: number, least: number) =>
    `the box is too small for the depth map: ${cols} x ${rows} cells, it needs ${least} x ${least}`,
  bars: "the box runs into the bars round the picture",
  spread:
    "the middle of the box holds more than one depth: the object may be thin, hollow or partly hidden",
  far: (reach: number) =>
    `along the camera's axis it is more than ${reach} times as deep as the far edge of the marked floor, where the fit is a guess`,
  near: "along the camera's axis it is much nearer than the near edge of the marked floor, where the fit is a guess",
  foot: (nearer: number, bar: number, share: number) =>
    `the foot of the box reads ${Math.round(nearer * 100)}% nearer than its middle, more than ${share} times the error bar (${Math.round(bar * 100)}%): the middle may show what is behind a hollow or thin object, or the box is loose`,
  retakes: "too few retakes of the Ruler's taps gave a fit",
  bar: (what: string) => `the error bar is wider than half the ${what}`,
  side: "the box touches the side of the picture, so the object may continue outside it",
  end: "the box touches the top or bottom of the picture, so the object may continue outside it",
  plumb: "the camera looks too nearly straight down for a plumb line to show",
};

/** The status line while nothing can be measured yet, by what is missing. */
export const WAITING = {
  none: "Not measuring yet: there is no picture on the stage. Open a photo.",
  moving:
    "Not measuring: this is a camera or a video. The Ruler's scale needs a photo, and a depth map takes up to a second to make, so on a moving picture it would describe an earlier frame than the boxes. Open a photo.",
  reference:
    "Not measuring yet: the Ruler has no reference on this photo. Open the Ruler, tap the four corners of a sheet lying on the floor, then outline a patch of floor from near to far with the Area tool. The depth model is not downloaded until then.",
  focal:
    "Not measuring yet: this picture does not pin down the camera's focal length. Tilt the camera so the reference shows perspective, or mark a plumb edge in the Ruler.",
  checking:
    "Checking whether the depth model is already stored on this device.",
  consent:
    "Not measuring yet: the Ruler is ready, and the depth model is not on this device. Nothing is downloaded until you press the button below.",
};
export const STATUS = {
  loading: "Loading the depth model. The first time this is a 99 MB download.",
  mapping: "Making the depth map of this photo.",
  relative: (reason: string) => `No metres: ${reason}`,
  failed: (note: string) =>
    `The depth model did not load (${note.replace(/^Vision model failed: /, "").replace(/\.$/, "")}). Boxes are not affected.`,
};
const boxes = (n: number) => (n === 1 ? "1 box" : `${n} boxes`);
/** The status line once there are metres: what was measured, and from what. */
export const readyText = (p: {
  measured: number;
  boxes: number;
  /** False until the retakes behind the bars are worked out. */
  settled: boolean;
  width: number;
  height: number;
  ms: number;
  delegate: string;
  floorCells: number;
  residual: number;
}) =>
  `${p.settled ? `Measuring ${p.measured} of ${boxes(p.boxes)}.` : `Working out the error bars for ${boxes(p.boxes)}.`} One depth map, ${p.width} x ${p.height} cells, made in ${p.ms.toFixed(0)} ms on ${p.delegate}. Fitted to ${p.floorCells.toLocaleString("en-US")} cells of marked floor, scatter ${share(p.residual)} of depth.`;
export const NO_SELECTION =
  "Select a box in the list above to see what its numbers rest on.";
export const libraryLine = (measured: number, all: number) =>
  `Measured objects: ${measured} of ${boxes(all)} in the latest frame ${measured === 1 ? "has" : "have"} a distance. Open Inspect and select a box for what each number rests on.`;

const got = (size: Sized): size is Measured => "value" in size;

/** The piece added to a box's label before its id, or "" for none. */
export const labelPiece = (reading: BoxReading | undefined): string =>
  !reading
    ? ""
    : reading.state === "measured"
      ? `${formatMeasured(reading.distance)} away`
      : reading.state === "pending"
        ? "measuring…"
        : "not measured";

/** The piece added to a box's Inspect row, or "" for none. */
export function rowPiece(reading: BoxReading | undefined): string {
  if (!reading) return "";
  if (reading.state === "pending") return WORKING;
  if (reading.state === "refused") return "not measured";
  const sizes = [
    got(reading.width) ? `${formatMeasured(reading.width)} wide` : "",
    got(reading.height) ? `${formatMeasured(reading.height)} tall` : "",
  ].filter(Boolean);
  return `${formatMeasured(reading.distance)} away${sizes.length ? ` · box ${sizes.join(", ")}` : ""}`;
}

export const distanceBasis = (p: {
  cells: number;
  retakes: number;
  residual: number;
  spread: number;
  /** When the depth is outside the marked floor: the floor's span, and the
   * depth as a multiple of the end it is past. Reach is judged on depth along
   * the camera's axis, which is shorter than the straight line shown. */
  beyond?: { near: string; far: string; end: "near" | "far"; times: number };
}) =>
  `Straight line from the camera to the surface in the middle of the box: the median of the depth map over the middle half of the box (${p.cells.toLocaleString("en-US")} cells), put in metres by the fit to the floor marked in the Ruler. The bar combines 2 standard deviations over ${p.retakes} simulated retakes of the Ruler's taps, twice the scatter of the fit on the marked floor (${share(p.residual)}), the spread of depths in the middle of the box (${share(p.spread)}) and an allowance of ${ALLOWANCE} for the depth model's error away from the floor. The allowance is twice the model's published mean relative error on indoor pictures (5.3%, NYU Depth v2); it was not measured on this picture, and the published figure is for a larger input than the one used here. A box whose foot (its lowest eighth) reads nearer than its middle by more than ${FOOT_SHARE} times this bar is not measured: its middle would be showing what is behind the object.${p.beyond ? ` Along the camera's axis the middle of the box is ${p.beyond.times.toFixed(2)} times as deep as the ${p.beyond.end} end of the marked floor (the floor runs from ${p.beyond.near} to ${p.beyond.far} deep), so the fit is stretched; ${p.beyond.end === "far" ? `past ${REACH}` : `under ${(1 / REACH).toFixed(2)}`} times nothing is measured.` : ""}`;

const UNCOVERED =
  "How far the box is from the object's real outline is not in the bar.";
const cellText = (px: number) => `${px.toFixed(1)} px of this picture`;

export const widthBasis = (p: { cell: number; keystone: number }) =>
  `The detector's box at that distance, across the camera's view. It is the box, not the object's outline: an object turned away from the camera or partly hidden is not this wide. The bar combines the distance's terms, one cell of the detector's input on each edge (${cellText(p.cell)}) and the change in scale between the top and bottom of an upright object (${share(p.keystone)}). ${UNCOVERED}`;

export const heightBasis = (p: { cell: number }) =>
  `The plumb line through the middle of the box, from its bottom edge to its top edge, using the Ruler's camera for which way is up. It takes the object as upright and thin front to back: a leaning or deep object, or one whose top or base is hidden, is not this tall. The bar combines the distance's terms and one cell of the detector's input on each edge (${cellText(p.cell)}). ${UNCOVERED}`;

/** What a selected box's numbers rest on, one paragraph per quantity; for a
 * box with no number, the one sentence that says why. */
export function detailOf(reading: BoxReading): string[] {
  if (reading.state === "pending") return [`${reading.label}: ${WORKING}.`];
  if (reading.state === "refused")
    return [`${reading.label}: not measured (${reading.reason}).`];
  const size = (name: string, what: string, value: Sized) =>
    got(value)
      ? `${name}: ${formatMeasured(value)}. ${value.basis}`
      : `${name}: ${what} not measured (${value.refused}).`;
  return [
    `Distance: ${formatMeasured(reading.distance)}. ${reading.distance.basis}`,
    size("Box width", "width", reading.width),
    size("Box height", "height", reading.height),
  ];
}

export const EXPORT_BASIS = `Distances are straight lines from the camera to the surface in the middle of each box, from one depth map scaled to floor marked in the Ruler. Sizes are the detector's box at that distance, not the object's outline. Errors are 2 standard deviations over simulated retakes of the Ruler's taps, combined with the fit's scatter, the spread of depth inside the box, an ${ALLOWANCE} allowance for the depth model away from the floor and one detector cell per box edge. A box whose foot reads nearer than its middle by more than ${FOOT_SHARE} times its bar has no number; footNearer is that gap as a share of the middle's depth.`;

const plain = (m: Measured) => ({
  value: m.value,
  error: m.error,
  unit: m.unit,
});

/** The `measured` key of an exported Objects frame. */
export function exportMeasured(
  measurement: Measurement,
  map: { width: number; height: number; delegate: string },
): Record<string, unknown> {
  if (!measurement.metric)
    return { metric: false, reason: STATUS.relative(measurement.reason) };
  const { scale } = measurement;
  return {
    metric: true,
    map,
    fit: {
      floorCells: scale.floorCells,
      residual: scale.fit.residual,
      retakes: measurement.retakes,
    },
    offFloorAllowance: OFF_FLOOR_ALLOWANCE,
    objects: measurement.boxes.map((box) => {
      if (box.state !== "measured")
        return {
          id: box.id,
          label: box.label,
          distance: null,
          boxWidth: null,
          boxHeight: null,
          refused: { all: box.state === "pending" ? WORKING : box.reason },
        };
      const refused = {
        ...(got(box.width) ? {} : { boxWidth: box.width.refused }),
        ...(got(box.height) ? {} : { boxHeight: box.height.refused }),
      };
      return {
        id: box.id,
        label: box.label,
        distance: plain(box.distance),
        boxWidth: got(box.width) ? plain(box.width) : null,
        boxHeight: got(box.height) ? plain(box.height) : null,
        ...(Object.keys(refused).length ? { refused } : {}),
        cells: box.cells,
        spread: box.spread,
        footNearer: box.footNearer,
      };
    }),
    basis: EXPORT_BASIS,
  };
}
