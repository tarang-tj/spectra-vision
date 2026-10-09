/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { angleDifference } from "../../measure/angles";
import { measured } from "../../measure/noise";
import { describe } from "../../measure/series";
import type { Baseline } from "./calibration";
import { handRows } from "./hand-metrics";
import { halfRange, notSeen, share, spread, weights } from "./row";
import type { MetricRow } from "./row";
import type { Recording, TaskName, Thresholds } from "./types";

const NO_CAL = (what: string) =>
  `${what} was not seen during calibration, so there is no noise floor to state an error from.`;
const finiteValues = (values: number[]) => values.filter(Number.isFinite);

function head(rec: Recording, base: Baseline, th: Thresholds): MetricRow {
  const id = "head",
    label = "Head direction near baseline";
  if (rec.face.length < 2)
    return notSeen(id, label, "No face was seen while measuring.");
  if (!base.face) return notSeen(id, label, NO_CAL("The face"));
  const w = weights(rec.face.map((f) => f.t)),
    off = rec.face.map((f) =>
      Math.hypot(
        angleDifference(f.yaw, base.face!.yaw),
        f.pitch - base.face!.pitch,
      ),
    ),
    at = (angle: number) => share(w, (i) => off[i] <= angle).percent,
    noise = base.face.noiseAngle,
    value = at(th.headAngle);
  if (!Number.isFinite(value))
    return notSeen(
      id,
      label,
      "The face was seen too briefly to cover any time.",
    );
  const [lo, hi] = spread(
    value,
    at(Math.max(0, th.headAngle - noise)),
    at(th.headAngle + noise),
  );
  return {
    id,
    label,
    range: [lo, hi],
    measured: measured(
      value,
      halfRange(value, lo, hi),
      "%",
      `Share of time the head direction (yaw and pitch from the face matrix) was within ${th.headAngle}° of the baseline held in calibration. Error: the share recomputed with the angle moved by the calibration noise, ±${noise.toFixed(1)}°. This is where the head points, not where the eyes look.`,
    ),
  };
}

function sway(rec: Recording, base: Baseline): MetricRow {
  const id = "sway",
    label = "Sway";
  const xs = rec.pose.map((p) => p.x);
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
      `Standard deviation of the shoulder midpoint's sideways position, in shoulder widths of the calibration frame. Error: the same spread measured while holding still in calibration. Leaning toward or away from the camera changes the apparent width.`,
    ),
  };
}

function stillness(rec: Recording, base: Baseline, th: Thresholds): MetricRow {
  const id = "stillness",
    label = "Stillness";
  const motion = rec.pose.map((p) => p.motion);
  if (finiteValues(motion).length < 2)
    return notSeen(
      id,
      label,
      "Not enough of the body was seen while measuring.",
    );
  if (!base.pose || !Number.isFinite(base.pose.motionMean))
    return notSeen(id, label, NO_CAL("The body"));
  const { scale, motionMean, motionSd } = base.pose,
    w = weights(rec.pose.map((p) => p.t)),
    use = w.map((weight, i) => (Number.isFinite(motion[i]) ? weight : 0)),
    at = (floor: number) =>
      share(use, (i) => motion[i] / scale <= th.stillMultiple * floor).percent,
    value = at(motionMean);
  if (!Number.isFinite(value))
    return notSeen(
      id,
      label,
      "The body was seen too briefly to cover any time.",
    );
  const [lo, hi] = spread(
    value,
    at(Math.max(0, motionMean - motionSd)),
    at(motionMean + motionSd),
  );
  return {
    id,
    label,
    range: [lo, hi],
    measured: measured(
      value,
      halfRange(value, lo, hi),
      "%",
      `Share of time the mean speed of shoulders, elbows, wrists and hips stayed at or under ${th.stillMultiple} times the noise floor (the mean speed measured while holding still, ${motionMean.toFixed(3)} shoulder widths a second). Error: the share recomputed with the floor moved by one calibration standard deviation.`,
    ),
  };
}

function expression(rec: Recording, base: Baseline): MetricRow {
  const id = "expression",
    label = "Expression change";
  const changes = finiteValues(rec.face.map((f) => f.change));
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
      "Mean absolute change per second of the smile, brow raise and jaw open scores (each 0 to 1), averaged. It measures how much the face moves, not what it means. Error: the same signal while holding still in calibration.",
    ),
  };
}

function wristWorld(rec: Recording, base: Baseline): MetricRow | null {
  const speeds = finiteValues(rec.pose.map((p) => p.worldSpeed));
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
