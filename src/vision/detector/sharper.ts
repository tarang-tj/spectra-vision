/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Objects' third model, "Sharper": D-FINE-S on WebGPU, in a worker of its own
// (public/detector-worker.js). It is never the default. It runs only while
// the person has chosen it, the task is on a real GPU and the browser has
// WebGPU; a frame took about 1.1 s on CPU, so there it is not offered at all.
// When it cannot start or its GPU device is lost, the task runner goes back
// to the MediaPipe detector and the reason is kept here for the page to say.
// It also stands aside while a Lab benchmark holds the standard model.
import { readFlag, writeFlag } from "../../shell/storage";
import { autoDelegate } from "../delegate";
import { delegateInUse, standardModelHeld } from "../model-choice";
import type { Delegate, TaskKind, TaskSpec } from "../types";

export const SHARPER_MODEL = "dfine_s_coco.onnx";
/** The lowest score a Sharper box is shown at, whatever the Confidence
 * slider says below it: the value the slider opens at. On the demo stills
 * and the recorded scene (scripts/detector-check.mjs) its real objects
 * scored 0.47 and up and its one false box 0.45; under that the model's 300
 * queries were not looked at. The worker carries the same figure as its
 * default; tests/detector-worker.test.ts holds the two together. */
export const SHARPER_MIN_SCORE = 0.45;
/** The square the picture is resized to: the size the model was trained at. */
export const SHARPER_SIZE = 640;
/** How long Sharper may take from its files being in to being ready. Its
 * first pass compiles shaders and took 5 s on an Apple M3, so the 8 s the
 * MediaPipe GPU start is given (delegate.ts) is too short for it. */
export const SHARPER_READY_LIMIT_MS = 30000;

const KEY = "spectra.sharper.v1";
let on: boolean | undefined,
  // Why Sharper was given up on this page, or null.
  refusal: string | null = null;
const listeners = new Set<() => void>();

/** Whether the person chose Sharper. Off unless switched on; remembered on
 * this device. */
export const sharperChosen = (): boolean => (on ??= readFlag(KEY) === "on");
/** Switching it on also forgets that it was given up, so it is tried again. */
export function setSharper(next: boolean) {
  const retry = next && refusal !== null;
  if (next === sharperChosen() && !retry) return;
  on = next;
  if (next) refusal = null;
  writeFlag(KEY, next ? "on" : "off");
  for (const listener of [...listeners]) listener();
}
/** Called when the choice changes. Returns the unsubscribe function. */
export function onSharperChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** How many runners are watching the choice (leak check for tests). */
export const sharperWatchers = () => listeners.size;

const hasWebGpu = () => typeof navigator !== "undefined" && "gpu" in navigator;
/** Whether the choice is shown at all: only where the page has a real GPU
 * (the same evidence the automatic delegate goes on) and WebGPU. */
export const sharperOffered = (): boolean =>
  hasWebGpu() && autoDelegate() === "GPU";

/** Give Sharper up for the rest of the page session. */
export const refuseSharper = (reason: string) => {
  refusal = reason;
};
/** Why Sharper was given up on this page, or null. */
export const sharperRefusal = (): string | null => refusal;
/** Why Sharper cannot run on `delegate` (by default the one the kind's
 * runner is on now), or null when it can. */
export function sharperBlocked(
  kind: TaskKind,
  delegate: Delegate | undefined = delegateInUse(kind),
): string | null {
  if (!hasWebGpu()) return "this browser has no WebGPU";
  if (delegate !== "GPU") return "Objects is on CPU here";
  if (standardModelHeld()) return "a Lab benchmark is running";
  return refusal;
}

/** The Sharper model this task runs, or null when another model is to run. */
export function sharperFor(
  spec: Partial<Pick<TaskSpec, "kind" | "sharpModel">>,
  delegate?: Delegate,
): string | null {
  if (!spec.sharpModel || !spec.kind || !sharperChosen()) return null;
  return sharperBlocked(spec.kind, delegate) ? null : spec.sharpModel;
}

/** What the Sharper worker is told beside the task's own options: its input
 * size, its score floor and the model's size in bytes (so the download is
 * read into one buffer). */
export const sharperOptions = (spec: Pick<TaskSpec, "sizes">) => ({
  size: SHARPER_SIZE,
  minScore: SHARPER_MIN_SCORE,
  bytes: spec.sizes?.[SHARPER_MODEL],
});

/** The worker script that runs `model` for a task of this kind. Depth and
 * Sharper are ONNX models, each with a worker of its own; everything else
 * is MediaPipe's. */
export const workerScript = (kind: TaskKind, model: string) =>
  kind === "depth"
    ? "depth-worker.js"
    : model.endsWith(".onnx")
      ? "detector-worker.js"
      : "vision-worker.js";

/** Test hook: forget the stored choice and the refusal. */
export const resetSharper = () => {
  on = undefined;
  refusal = null;
};
