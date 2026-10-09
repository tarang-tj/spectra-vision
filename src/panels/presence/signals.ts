/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { headPose } from "../../measure/angles";
import { faceExtra } from "../../modes/lib/task-extras";
import { faceMeters } from "../../modes/lib/face-metrics";
import { seen } from "../../modes/lib/fusion-figure";
import type { Point, TaskResult, VisionResult } from "../../vision/types";
import { MAX_STEP_MS } from "./types";
import type { FaceSample, HandSample, PoseSample, Signals } from "./types";

// Pose landmarks used for whole-body motion: shoulders, elbows, wrists, hips.
const BODY = [11, 12, 13, 14, 15, 16, 23, 24];
const WRISTS = [15, 16];
const PALM = [0, 5, 9, 13, 17];
const CHANGED = ["smile", "brow", "jaw"];

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (values: number[]) =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;

/** Turns merged vision results into per-task samples. It remembers the last
 * sample of each task so speeds can be taken between consecutive results, and
 * the last task result of each kind so a result that has not changed is not
 * counted twice. Call `reset()` after a gap in the stream. */
export class SignalExtractor {
  private lastTask: Partial<Record<string, TaskResult>> = {};
  private prevFace: { t: number; shapes: number[] } | null = null;
  private prevPose: {
    t: number;
    pts: Map<number, Pt>;
    world: Map<number, Point>;
  } | null = null;
  private prevHand: { t: number; centres: Map<string, Pt> } | null = null;

  reset() {
    // lastTask is kept: a task result seen before a pause is not new after it.
    this.prevFace = this.prevPose = this.prevHand = null;
  }

  ingest(result: VisionResult, aspect: number): Signals {
    const out: Signals = { t: result.time },
      { face, pose, hand } = result.tasks;
    if (face && face !== this.lastTask.face) out.face = this.face(face);
    if (pose && pose !== this.lastTask.pose) out.pose = this.pose(pose, aspect);
    if (hand && hand !== this.lastTask.hand) out.hand = this.hand(hand, aspect);
    this.lastTask = { face, pose, hand };
    return out;
  }

  private face(task: TaskResult): FaceSample | null {
    const extra = faceExtra(task),
      head = headPose(extra?.matrices[0]),
      shapes = extra?.blendshapes[0];
    if (!extra || !head || !shapes) {
      this.prevFace = null;
      return null;
    }
    const meters = faceMeters(shapes),
      values = CHANGED.map(
        (id) => meters.find((m) => m.id === id)?.value ?? NaN,
      ),
      prev = this.prevFace,
      dt = prev ? (task.time - prev.t) / 1000 : NaN;
    this.prevFace = { t: task.time, shapes: values };
    const change =
      prev && dt > 0 && dt * 1000 <= MAX_STEP_MS
        ? mean(values.map((v, i) => Math.abs(v - prev.shapes[i]))) / dt
        : NaN;
    const nose = task.landmarks[0]?.[1];
    return {
      t: task.time,
      yaw: head.yaw,
      pitch: head.pitch,
      change,
      nose: nose ? { x: nose.x, y: nose.y } : null,
    };
  }

  private pose(task: TaskResult, aspect: number): PoseSample | null {
    const lm = task.landmarks[0],
      left = lm?.[11],
      right = lm?.[12];
    if (!lm || !seen(left) || !seen(right)) {
      this.prevPose = null;
      return null;
    }
    const pts = new Map<number, Pt>();
    for (const i of BODY)
      if (seen(lm[i])) pts.set(i, { x: lm[i].x * aspect, y: lm[i].y });
    const world = new Map<number, Point>(),
      worldList = (task.extra as { world?: Point[][] } | undefined)?.world?.[0];
    if (Array.isArray(worldList))
      for (const i of WRISTS)
        if (seen(worldList[i])) world.set(i, worldList[i]);
    const prev = this.prevPose,
      dt = prev ? (task.time - prev.t) / 1000 : NaN,
      ok = prev && dt > 0 && dt * 1000 <= MAX_STEP_MS;
    const speeds: number[] = [],
      worldSpeeds: number[] = [];
    if (ok) {
      for (const [i, p] of pts) {
        const q = prev.pts.get(i);
        if (q) speeds.push(dist(p, q) / dt);
      }
      for (const [i, p] of world) {
        const q = prev.world.get(i);
        if (q)
          worldSpeeds.push(
            Math.hypot(p.x - q.x, p.y - q.y, (p.z ?? 0) - (q.z ?? 0)) / dt,
          );
      }
    }
    this.prevPose = { t: task.time, pts, world };
    return {
      t: task.time,
      x: ((left.x + right.x) / 2) * aspect,
      width: dist(
        { x: left.x * aspect, y: left.y },
        { x: right.x * aspect, y: right.y },
      ),
      motion: mean(speeds),
      worldSpeed: mean(worldSpeeds),
    };
  }

  private hand(task: TaskResult, aspect: number): HandSample {
    const prev = this.prevHand,
      dt = prev ? (task.time - prev.t) / 1000 : NaN,
      ok = prev && dt > 0 && dt * 1000 <= MAX_STEP_MS,
      centres = new Map<string, Pt>(),
      hands: HandSample["hands"] = [];
    task.landmarks.forEach((lm, i) => {
      const label = task.handedness[i] || `hand ${i + 1}`;
      // Two hands under one label cannot be told apart: keep the first.
      if (centres.has(label)) return;
      const pts = PALM.map((k) => lm[k]).filter(Boolean);
      if (!pts.length) return;
      const c = {
        x: mean(pts.map((p) => p.x)) * aspect,
        y: mean(pts.map((p) => p.y)),
      };
      centres.set(label, c);
      const before = ok ? prev.centres.get(label) : undefined;
      hands.push({ label, speed: before ? dist(c, before) / dt : NaN });
    });
    this.prevHand = { t: task.time, centres };
    return { t: task.time, hands };
  }
}
