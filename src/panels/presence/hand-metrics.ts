/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { measured } from "../../measure/noise";
import type { Baseline } from "./calibration";
import { countStarts } from "./hand-events";
import type { SpeedSample } from "./hand-events";
import { halfRange, notSeen, share, spread, sum, weights } from "./row";
import type { MetricRow } from "./row";
import type { Recording, Thresholds } from "./types";

/** The labels the model gives hands, always listed so a hand that never came
 * into view reads "not seen" rather than being left out. */
const USUAL = ["Left", "Right"];

/** Hand movement starts per minute, and the share of time each hand was in view. */
export function handRows(
  rec: Recording,
  base: Baseline,
  th: Thresholds,
): MetricRow[] {
  const labels = new Set(USUAL);
  rec.hand.forEach((s) => s.hands.forEach((h) => labels.add(h.label)));
  const w = weights(rec.hand.map((s) => s.t)),
    anySeen = rec.hand.some((s) => s.hands.length > 0);
  const views = [...labels].map((label): MetricRow => {
    const id = `hand-view-${label.toLowerCase()}`,
      name = `${label} hand in view`,
      own = rec.hand.map((s) => s.hands.some((h) => h.label === label));
    if (!own.some(Boolean))
      return notSeen(id, name, `No hand labelled ${label} was seen.`);
    const { percent, step } = share(w, (i) => own[i]);
    if (!Number.isFinite(percent))
      return notSeen(
        id,
        name,
        "Hands were seen too briefly to cover any time.",
      );
    const seenMs = w.reduce((acc, weight, i) => acc + (own[i] ? weight : 0), 0);
    return {
      id,
      label: name,
      // Not a `denominator`: this share is the seen time over the covered
      // time itself, so the two times are stated as plain detail.
      detail: `${(seenMs / 1000).toFixed(1)} s of ${(sum(w) / 1000).toFixed(1)} s`,
      measured: measured(
        percent,
        step,
        "%",
        `Share of the time the hand model ran (${(sum(w) / 1000).toFixed(1)} s) in which it found a hand it labelled ${label} (the model's own label). Error: one result interval. Misses by the model are not included.`,
      ),
    };
  });

  const id = "hand-moves",
    label = "Hand movement starts";
  let events: MetricRow;
  if (!anySeen)
    events = notSeen(id, label, "No hand was in view while measuring.");
  else if (!base.pose)
    events = notSeen(
      id,
      label,
      "The shoulders were not seen during calibration, so hand speed has no length scale.",
    );
  else if (!base.hand)
    events = notSeen(
      id,
      label,
      "Hands were not in view during calibration, so hand speed has no noise floor.",
    );
  else if (!(rec.coveredMs > 0))
    events = notSeen(id, label, "No time covered yet.");
  else {
    const { scale } = base.pose,
      noise = base.hand.speedNoise,
      lists = new Map<string, SpeedSample[]>();
    for (const s of rec.hand)
      for (const h of s.hands) {
        const list = lists.get(h.label) ?? [];
        list.push({ t: s.t, speed: h.speed / scale });
        lists.set(h.label, list);
      }
    const minutes = rec.coveredMs / 60000,
      count = (speed: number) => {
        let n = 0;
        for (const list of lists.values())
          n += countStarts(list, speed, th.handStill);
        return n;
      },
      perMinute = (speed: number) => count(speed) / minutes,
      starts = count(th.handSpeed),
      value = perMinute(th.handSpeed),
      lo = perMinute(th.handSpeed + noise),
      hi = perMinute(Math.max(0, th.handSpeed - noise));
    const range = spread(value, lo, hi);
    events = {
      id,
      label,
      range,
      detail: `${starts} ${starts === 1 ? "start" : "starts"} in ${(rec.coveredMs / 1000).toFixed(1)} s`,
      measured: measured(
        value,
        // One start more or less is the resolution of a count.
        Math.max(halfRange(value, range[0], range[1]), 1 / minutes),
        "per min",
        `Times a hand sped up to ${th.handSpeed} shoulder widths a second or more after at least ${th.handStill} ms under it, per minute covered. Hand speed is the palm centre's. Error: the count recomputed with the speed threshold moved by the calibration noise, ±${noise.toFixed(2)} shoulder widths a second (a count can rise or fall as the threshold moves), and never under one start in the time covered. The noise floor was measured at the frame rate of the calibration; a different rate later changes it.`,
      ),
    };
  }
  return [events, ...views];
}
