/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Every sentence the scorecard shows or exports, as pure functions of what
// was measured. The panel and the Markdown export both read from here, so
// the words on the page and in the file cannot drift apart. No number is
// written in this file except the publishers' scores, which are quoted as
// theirs and as not comparable.
import type { Difference, Figure } from "./bootstrap";
import { MIN_OBJECTS, RESAMPLES } from "./bootstrap";
import type { PointItem } from "./operating-point";
import type { Progress } from "./score-run";
import { SET_BYTES } from "./score-set";
import { FLOOR, MAX_BOXES } from "./score-worker";

/** What the page knows about the set once its list has been read. */
export type SetFacts = {
  pictures: number;
  boxes: number;
  bytes: number;
  checked: string;
};
/** A shortened test run: how many of the set's pictures were scored. */
export type Shortened = { scored: number; of: number } | null;

export const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);
export const percent = (value: number) => `${Math.round(value * 100)}%`;
export const NOT_MEASURED = "not measured";

export const intro = (set: SetFacts | null) =>
  `Scores the object detectors against ${
    set
      ? `${set.pictures} labelled photographs`
      : "a set of labelled photographs"
  }, in this browser. Speed says how fast a model runs here; this says how often it is right. The photographs (${megabytes(set ? set.bytes : SET_BYTES)} MB) are downloaded only when you press Run.`;
export const UNDER_BUTTON =
  "The stage is paused while this runs and resumes after. Each model is given every picture once, after one pass that is not counted.";
export const shortenedNote = (short: Shortened) =>
  short ? ` (shortened test run: ${short.scored} of ${short.of} pictures)` : "";

export const progressText = {
  list: "Reading the picture list",
  loading: (label: string, delegate: string) =>
    `${label} on ${delegate}: loading`,
  picture: (label: string, delegate: string, i: number, n: number) =>
    `${label} on ${delegate}: picture ${i} of ${n}`,
  intervals: "Working out the intervals",
  finished: (runs: number) => `Finished ${runs} runs.`,
  stopped: "Stopped. A run that did not finish is not shown.",
  failed: (reason: string) => `The scorecard could not run: ${reason}`,
};
/** The progress line for one step of the run loop. */
export const progressOf = (state: Progress, short: Shortened) =>
  state.step === "list"
    ? progressText.list
    : state.step === "loading"
      ? progressText.loading(state.target.label, state.target.delegate)
      : progressText.picture(
          state.target.label,
          state.target.delegate,
          state.index,
          state.of,
        ) + shortenedNote(short);

const range = (
  figure: Figure,
  show: (value: number) => string,
  unit: string,
) =>
  figure.basis === "none" || figure.lo === null || figure.hi === null
    ? "interval not stated"
    : `${show(figure.lo)} to ${show(figure.hi)}${
        figure.basis === "wilson" ? `, Wilson over ${figure.over} ${unit}` : ""
      }`;
const whole = (value: number) => String(Math.round(value * 100));
export const tooFew = (objects: number) =>
  `too few labelled objects (${objects})`;
/** A Found or Right cell: `58% (52 to 64)`. `empty` is said when the figure
 * is not a number (no box was kept, so Right has nothing to divide by). */
export const shareCell = (figure: Figure, unit: string, empty: string) =>
  figure.value === null
    ? empty
    : `${whole(figure.value)}% (${range(figure, whole, unit)})`;
/** An AP cell: `0.41 (0.34 to 0.48)`. */
export const apCell = (figure: Figure) =>
  figure.value === null
    ? NOT_MEASURED
    : `${figure.value.toFixed(2)} (${range(figure, (v) => v.toFixed(2), "objects")})`;
export const speedCell = (p50: number, p95: number) =>
  `${Math.round(p50)} (p95 ${Math.round(p95)})`;
export const didNotRun = (reason: string) => `did not run: ${reason}`;

export const caption = (scored: number, objects: number) =>
  `A spot check on ${scored} photographs holding ${objects} labelled objects, not a benchmark result. The range in brackets is where each figure falls in 95 of 100 redraws of these pictures (${RESAMPLES.toLocaleString("en-US")} resamples of whole pictures). It covers the luck of which pictures were picked. The AP ranges are not symmetric about the figure: on a set this small a redraw's AP tends to come out above it, so read the low end as close and the high end as loose. It does not cover how different your camera's pictures are from these.`;

/** The basis lines under the caption, in order. */
export const basisLines = (
  set: SetFacts,
  confidence: number,
  classes: number,
): string[] => [
  `Found and Right are counted at Confidence ${percent(confidence)} (the Inspect slider; Sharper never under 45%). A box is a hit when it has the label's class and overlaps it by at least half of their joined area (IoU 0.50). Found is hits over labelled objects; Right is hits over boxes drawn.`,
  `AP uses every box down to a score of ${percent(FLOOR)}, at most ${MAX_BOXES} a picture, matched and averaged the way COCO's scorer does, over the ${classes} classes that appear in these pictures.`,
  `The pictures are ${set.pictures} of COCO's 5,000 validation photographs: the first by id that are CC BY 2.0, still so on Flickr on ${set.checked}, and show no person. So this says nothing about the person class, and it is not a random sample of COCO.`,
  "Each model runs as SPECTRA runs it on one still picture, without tracking or held boxes. The publishers' COCO scores (EfficientDet-Lite0 26.4, Lite2 35.1, D-FINE-S 48.5) are for all 5,000 pictures with their own post-processing and, for EfficientDet, their own checkpoints. They are not comparable with the AP column.",
  "ms a picture is the median time of the model call inside the worker over these pictures, one pass, stage paused.",
];

const signed = (value: number, show: (v: number) => string) =>
  `${value < 0 ? "-" : "+"}${show(Math.abs(value))}`;
const gap = (d: Difference, show: (v: number) => string, unit = "") =>
  d.value === null
    ? NOT_MEASURED
    : `${signed(d.value, show)}${unit} (${
        d.lo === null || d.hi === null
          ? "interval not stated"
          : `${signed(d.lo, show)} to ${signed(d.hi, show)}`
      })`;
const CANNOT = "these pictures cannot tell them apart";
/** One paired comparison: the two gaps, then what they allow to be said. A
 * gap whose interval holds zero is never called more or fewer. */
export function comparison(
  run: string,
  against: string,
  found: Difference,
  ap50: Difference,
): string {
  const verdicts =
    found.verdict === "cannot tell" && ap50.verdict === "cannot tell"
      ? `On found and on AP50 ${CANNOT}.`
      : `${
          found.verdict === "cannot tell"
            ? `On found ${CANNOT}`
            : `Found ${found.verdict}`
        }; ${
          ap50.verdict === "cannot tell"
            ? `on AP50 ${CANNOT}`
            : `AP50 is ${ap50.verdict === "more" ? "higher" : "lower"}`
        }.`;
  return `${run} against ${against}: found ${gap(found, whole, " points")}, AP50 ${gap(ap50, (v) => v.toFixed(3))}. ${verdicts}`;
}

export const otherClasses = (count: number) =>
  `${count} other classes have fewer than ${MIN_OBJECTS} labelled objects each in this set, too few to state a figure for.`;

export const LEGEND = {
  hit: "Hit",
  miss: "Miss: a label no box matched",
  false: "False box",
  crowd: "Crowd region: boxes here are not counted",
};
/** One line of the list under a picture, so colour is never the only carrier. */
export function itemLine(item: PointItem): string {
  if (item.kind === "miss") return `miss: ${item.label}`;
  const box = `${item.label} ${percent(item.score)}`;
  if (item.kind === "hit")
    return `hit: ${box}, overlap ${item.overlap.toFixed(2)}`;
  if (item.kind === "ignored") return `not counted: ${box}, in a crowd region`;
  const why =
    item.why === "wrong name"
      ? `wrong name (labelled ${item.labelled})`
      : item.why === "second box"
        ? "second box on one object"
        : "nothing labelled there";
  return `false box: ${box}, ${why}`;
}
export const countsLine = (
  hits: number,
  misses: number,
  falses: number,
  confidence: number,
) =>
  `${hits} hits, ${misses} misses, ${falses} false boxes at Confidence ${percent(confidence)}`;
export const pictureOf = (i: number, n: number) => `Picture ${i} of ${n}`;
export const ONLY_WRONG = "Only pictures with a miss or a false box";
export const LABELS_CREDIT = "Labels: COCO Consortium, CC BY 4.0.";
