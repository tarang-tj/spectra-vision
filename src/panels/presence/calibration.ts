/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { angleDifference } from "../../measure/angles";
import { describe } from "../../measure/series";
import { percentile } from "../../telemetry/stats";
import { MIN_CALIBRATION_SAMPLES } from "./types";
import type { Signals } from "./types";

/** What the 5 second hold-still interval taught us. A part is null when its
 * task saw too little (fewer than 5 samples) to give a noise figure. */
export type Baseline = {
  durationMs: number;
  face: {
    n: number;
    /** Median head direction while looking at the camera, degrees. */
    yaw: number;
    pitch: number;
    /** Spread of head direction while held still: sqrt(sd yaw^2 + sd pitch^2), degrees. */
    noiseAngle: number;
    /** Mean of the expression-change signal while the face was held still, per s. */
    changeNoise: number;
  } | null;
  pose: {
    n: number;
    /** Median shoulder distance, image-height units: the length of "one shoulder width". */
    scale: number;
    /** Mean shoulder midpoint, in shoulder widths. */
    x0: number;
    /** Sd of the shoulder midpoint while held still, shoulder widths. */
    swayNoise: number;
    /** Mean and sd of whole-body speed while held still, shoulder widths / s. */
    motionMean: number;
    motionSd: number;
    /** Mean wrist speed relative to the hips, m/s; NaN without world landmarks. */
    worldNoise: number;
  } | null;
  hand: {
    n: number;
    /** Sd of palm speed while held still, shoulder widths / s (needs `pose`). */
    speedNoise: number;
  } | null;
};

const finite = (values: number[]) => values.filter(Number.isFinite);

/** Collects the calibration interval, then turns it into a `Baseline`. */
export class Calibrator {
  private yaw: number[] = [];
  private pitch: number[] = [];
  private change: number[] = [];
  private x: number[] = [];
  private width: number[] = [];
  private motion: number[] = [];
  private world: number[] = [];
  private hand: number[] = [];

  add(s: Signals) {
    if (s.face) {
      this.yaw.push(s.face.yaw);
      this.pitch.push(s.face.pitch);
      this.change.push(s.face.change);
    }
    if (s.pose) {
      this.x.push(s.pose.x);
      this.width.push(s.pose.width);
      this.motion.push(s.pose.motion);
      this.world.push(s.pose.worldSpeed);
    }
    for (const h of s.hand?.hands ?? []) this.hand.push(h.speed);
  }

  finish(durationMs: number): Baseline {
    const base: Baseline = { durationMs, face: null, pose: null, hand: null };
    if (this.yaw.length >= MIN_CALIBRATION_SAMPLES) {
      const yaw0 = percentile(this.yaw, 0.5),
        pitch0 = percentile(this.pitch, 0.5),
        // Yaw differences are taken around the median so a wrap cannot split it.
        yawSd = describe(this.yaw.map((v) => angleDifference(v, yaw0))).sd,
        pitchSd = describe(this.pitch).sd,
        changes = describe(finite(this.change));
      base.face = {
        n: this.yaw.length,
        yaw: yaw0,
        pitch: pitch0,
        noiseAngle: Math.hypot(yawSd, pitchSd),
        changeNoise:
          changes.count >= MIN_CALIBRATION_SAMPLES ? changes.mean : NaN,
      };
    }
    if (this.x.length >= MIN_CALIBRATION_SAMPLES) {
      const scale = percentile(this.width, 0.5);
      if (scale > 0) {
        const xs = describe(this.x.map((v) => v / scale)),
          motion = describe(finite(this.motion).map((v) => v / scale)),
          world = describe(finite(this.world));
        base.pose = {
          n: this.x.length,
          scale,
          x0: xs.mean,
          swayNoise: xs.sd,
          motionMean:
            motion.count >= MIN_CALIBRATION_SAMPLES ? motion.mean : NaN,
          motionSd: motion.count >= MIN_CALIBRATION_SAMPLES ? motion.sd : NaN,
          worldNoise: world.count >= MIN_CALIBRATION_SAMPLES ? world.mean : NaN,
        };
        const speeds = describe(finite(this.hand).map((v) => v / scale));
        if (speeds.count >= MIN_CALIBRATION_SAMPLES)
          base.hand = { n: speeds.count, speedNoise: speeds.sd };
      }
    }
    return base;
  }
}
