/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { measured } from "../../measure/noise";
import { describe } from "../../measure/series";
import type { Baseline } from "./calibration";
import { handRows } from "./hand-metrics";
import { headAngleBetween } from "./head-angle";
import {
  denominatorText,
  halfRange,
  notSeen,
  seenChain,
  share,
  spread,
} from "./row";
import type { MetricRow } from "./row";
import type { Recording, TaskName, Thresholds } from "./types";

const NO_CAL = (what: string) =>
  `${what} was not seen during calibration, so there is no noise floor to state an error from.`;
const finiteValues = (values: number[]) => values.filter(Number.isFinite);
const RATE_NOTE =
  " The noise floor was measured at the frame rate of the calibration; a different rate later changes it.";

function head(rec: Recording, base: Baseline, th: Thresholds): MetricRow {
  const id = "head",
    label = "Head direction near baseline";
  if (!base.face && rec.seen.face >= 2)
    return notSeen(id, label, NO_CAL("The face"));
  const { samples, w, seenMs, coveredMs } = seenChain(rec.face);
  if (samples.length < 2)
    return notSeen(id, label, "No face was seen while measuring.");
  if (!base.face) return notSeen(id, label, NO_CAL("The face"));
  const bf = base.face,
    off = samples.map((f) =>
      headAngleBetween(f.yaw, f.pitch, bf.yaw, bf.pitch),
    ),
    at = (angle: number) => share(w, (i) => off[i] <= angle),
    noise = bf.noiseAngle,
    nominal = at(th.headAngle),
    value = nominal.percent;
  if (!Number.isFinite(value))
    return notSeen(
      id,
      label,
      "The face was seen too briefly to cover any time.",
    );
  const [lo, hi] = spread(
    value,
    at(Math.max(0, th.headAngle - noise)).percent,
    at(th.headAngle + noise).percent,
  );
  const denominator = { what: "a face was seen", seenMs, coveredMs };
  return {
    id,
    label,
    range: [lo, hi],
    denominator,
    measured: measured(
      value,
      // Never smaller than one result interval's share.
      Math.max(halfRange(value, lo, hi), nominal.step),
      "%",
      `Share of the time a face was seen (${denominatorText(denominator)}) in which the angle between the head direction and the baseline held in calibration was ${th.headAngle}° or less. Time the face was lost is not in the denominator. Error: the share recomputed with the angle moved by the calibration noise, ±${noise.toFixed(1)}°, and never under one result interval. This is where the head points, not where the eyes look.`,
    ),
  };
}

function sway(rec: Recording, base: Baseline): MetricRow {
  const id = "sway",
    label = "Sway";
  const xs = rec.pose.flatMap((p) => (p.s ? [p.s.x] : []));
  if (xs.length < 2)
    return notSeen(id, label, "Both shoulders were not seen while measuring.");
  if (!base.pose) return notSeen(id, label, NO_CAL("The shoulders"));
  const sd = describe(xs.map((x) => x / base.pose!.scale)).sd;
  return {
    id,
    label,
    measured: measured(
      sd,
      base.pose.swayNoise,
      "shoulder widths",
      `Standard deviation of the shoulder midpoint's sideways position over the time both shoulders were seen, in shoulder widths of the calibration frame. Error: the same spread measured while holding still in calibration. Leaning toward or away from the camera changes the apparent width.`,
    ),
  };
}

function stillness(rec: Recording, base: Baseline, th: Thresholds): MetricRow {
  const id = "stillness",
    label = "Stillness";
  const { samples, w: w0, seenMs, coveredMs } = seenChain(rec.pose),
    motion = samples.map((p) => p.motion);
  if (finiteValues(motion).length < 2)
    return notSeen(
      id,
      label,
      "Not enough of the body was seen while measuring.",
    );
  if (!base.pose || !Number.isFinite(base.pose.motionMean))
    return notSeen(id, label, NO_CAL("The body"));
  const { scale, motionMean, motionSd } = base.pose,
    use = w0.map((weight, i) => (Number.isFinite(motion[i]) ? weight : 0)),
    at = (floor: number) =>
      share(use, (i) => motion[i] / scale <= th.stillMultiple * floor),
    nominal = at(motionMean),
    value = nominal.percent;
  if (!Number.isFinite(value))
    return notSeen(
      id,
      label,
      "The body was seen too briefly to cover any time.",
    );
  const [lo, hi] = spread(
    value,
    at(Math.max(0, motionMean - motionSd)).percent,
    at(motionMean + motionSd).percent,
  );
  const denominator = { what: "both shoulders were seen", seenMs, coveredMs };
  return {
    id,
    label,
    range: [lo, hi],
    denominator,
    measured: measured(
      value,
      Math.max(halfRange(value, lo, hi), nominal.step),
      "%",
      `Share of the time the body was seen (${denominatorText(denominator)}) in which the mean speed of shoulders, elbows, wrists and hips stayed at or under ${th.stillMultiple} times the noise floor (the mean speed measured while holding still, ${motionMean.toFixed(3)} shoulder widths a second). Time the body was lost is not in the denominator. Error: the share recomputed with the floor moved by one calibration standard deviation, and never under one result interval.${RATE_NOTE}`,
    ),
  };
}

function expression(rec: Recording, base: Baseline): MetricRow {
  const id = "expression",
    label = "Expression change";
  const changes = finiteValues(rec.face.map((f) => f.s?.change ?? NaN));
  if (changes.length < 2)
    return notSeen(id, label, "No face was seen while measuring.");
  if (!base.face || !Number.isFinite(base.face.changeNoise))
    return notSeen(id, label, NO_CAL("The face"));
  return {
    id,
    label,
    measured: measured(
      describe(changes).mean,
      base.face.changeNoise,
      "per s",
      `Mean absolute change per second of the smile, brow raise and jaw open scores (each 0 to 1), averaged, over the time the face was seen. It measures how much the face moves, not what it means. Error: the same signal while holding still in calibration.${RATE_NOTE}`,
    ),
  };
}

function wristWorld(rec: Recording, base: Baseline): MetricRow | null {
  const speeds = finiteValues(rec.pose.map((p) => p.s?.worldSpeed ?? NaN));
  if (!speeds.length) return null;
  const id = "wrist-world",
    label = "Wrist speed relative to hips";
  if (!base.pose || !Number.isFinite(base.pose.worldNoise))
    return notSeen(id, label, NO_CAL("The wrists"));
  return {
    id,
    label,
    measured: measured(
      describe(speeds).mean,
      base.pose.worldNoise,
      "m/s",
      "Mean speed of the wrists measured from the pose model's world landmarks (metres, origin at the hips), so body sway is not included. Error: the same signal while holding still in calibration. World scale is the model's estimate.",
    ),
  };
}

function timeCovered(rec: Recording): MetricRow {
  const id = "time",
    label = "Time covered";
  if (!rec.steps || !(rec.coveredMs > 0))
    return notSeen(id, label, "No results while measuring yet.");
  return {
    id,
    label,
    measured: measured(
      rec.coveredMs / 1000,
      rec.coveredMs / rec.steps / 1000,
      "s",
      "Time between model results while the stage was running. Paused or hidden time is left out. Error: one result interval.",
    ),
  };
}

const NAMES: Record<TaskName, string> = {
  face: "Face seen",
  pose: "Body seen",
  hand: "Hands seen",
};
const FOUND: Record<TaskName, string> = {
  face: "a usable face",
  pose: "both shoulders",
  hand: "at least one hand",
};
function coverage(rec: Recording, task: TaskName): MetricRow {
  const id = `seen-${task}`,
    fresh = rec.fresh[task];
  if (!fresh) return notSeen(id, NAMES[task], "The model gave no result.");
  return {
    id,
    label: NAMES[task],
    measured: measured(
      (100 * rec.seen[task]) / fresh,
      100 / fresh,
      "%",
      `Share of the ${fresh} ${task} results that found ${FOUND[task]}. Error: one result.`,
    ),
  };
}

/** Every metric of a recording, each as a value with its error and basis or as
 * "not seen" with the reason. Pure: the same inputs always give the same rows. */
export function computeRows(
  rec: Recording,
  base: Baseline,
  th: Thresholds,
): MetricRow[] {
  const rows = [
    head(rec, base, th),
    ...handRows(rec, base, th),
    sway(rec, base),
    stillness(rec, base, th),
    expression(rec, base),
    wristWorld(rec, base),
    timeCovered(rec),
    coverage(rec, "face"),
    coverage(rec, "pose"),
    coverage(rec, "hand"),
  ];
  return rows.filter((row): row is MetricRow => row !== null);
}
