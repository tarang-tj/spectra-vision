/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Every word Measure objects shows: the piece on a box's label, the piece on
// its Inspect row, why a box or one of its sizes is not measured, what each
// number rests on, and the session export. A size is always "box ... wide"
// or "box ... tall": it is the detector's box at the object's distance, not
// the object's outline.
import { OFF_FLOOR_ALLOWANCE } from "../../measure/box-size";
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
    `it is more than ${reach} times as far as the far edge of the marked floor, where the fit is a guess`,
  near: "it is much nearer than the near edge of the marked floor, where the fit is a guess",
  retakes: "too few retakes of the Ruler's taps gave a fit",
  bar: (what: string) => `the error bar is wider than half the ${what}`,
  side: "the box touches the side of the picture, so the object may continue outside it",
  end: "the box touches the top or bottom of the picture, so the object may continue outside it",
  plumb: "the camera looks too nearly straight down for a plumb line to show",
};

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
  /** The marked floor's span, when the depth is outside it. */
  beyond?: { near: string; far: string };
}) =>
  `Straight line from the camera to the surface in the middle of the box: the median of the depth map over the middle half of the box (${p.cells.toLocaleString("en-US")} cells), put in metres by the fit to the floor marked in the Ruler. The bar combines 2 standard deviations over ${p.retakes} simulated retakes of the Ruler's taps, twice the scatter of the fit on the marked floor (${share(p.residual)}), the spread of depths in the middle of the box (${share(p.spread)}) and an allowance of ${ALLOWANCE} for the depth model's error away from the floor. The allowance is twice the model's published mean relative error on indoor pictures (5.3%, NYU Depth v2); it was not measured on this picture, and the published figure is for a larger input than the one used here.${p.beyond ? ` This is beyond the marked floor (${p.beyond.near} to ${p.beyond.far} from the camera), so the fit is stretched.` : ""}`;

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

export const EXPORT_BASIS = `Distances are straight lines from the camera to the surface in the middle of each box, from one depth map scaled to floor marked in the Ruler. Sizes are the detector's box at that distance, not the object's outline. Errors are 2 standard deviations over simulated retakes of the Ruler's taps, combined with the fit's scatter, the spread of depth inside the box, an ${ALLOWANCE} allowance for the depth model away from the floor and one detector cell per box edge.`;

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
    return { metric: false, reason: `No metres: ${measurement.reason}` };
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
      };
    }),
    basis: EXPORT_BASIS,
  };
}
