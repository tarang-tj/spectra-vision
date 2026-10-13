/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A task may name a larger model that is worth its cost only on a real GPU
// (`TaskSpec.gpuModel`). It runs while the task is on GPU, unless the person
// switched it off or it proved slow on this device. On CPU, and after a GPU
// to CPU fallback, the task's standard model runs. The Precision setting
// wins over all of this (settings.ts, `modelOf`). A Lab benchmark holds the
// standard model on every delegate while it runs, so its rows time one file.
import { readFlag, writeFlag } from "../shell/storage";
import type { Delegate, TaskKind, TaskSpec } from "./types";

/** The larger model is given up when its median inference time over its
 * first GUARD_RESULTS results is above this (ms). Measured on an Apple M3:
 * 60 ms for EfficientDet-Lite2 against 45 ms for Lite0. No slower GPU was
 * measured, which is what this guard is for. */
export const SLOW_MS = 120;
export const GUARD_RESULTS = 30;

const KEY = "spectra.gpumodel.v1";
let on: boolean | undefined,
  // True while a Lab benchmark runs. Never stored, so a closed tab cannot
  // leave it on.
  standardOnly = false;
const listeners = new Set<() => void>(),
  // The delegate each kind's runner is on now, written by the runner.
  inUse = new Map<TaskKind, Delegate>(),
  // Kinds whose larger model was given up on this page, with the reason.
  refused = new Map<TaskKind, string>();
const announce = () => {
  for (const listener of [...listeners]) listener();
};

/** Whether a task's larger model may run on a GPU. On unless switched off;
 * remembered on this device. */
export const largerOnGpu = (): boolean => (on ??= readFlag(KEY) !== "off");
/** Switching it on also forgets that the larger model was given up, so it is
 * tried again. */
export function setLargerOnGpu(next: boolean) {
  const retry = next && refused.size > 0;
  if (next === largerOnGpu() && !retry) return;
  on = next;
  if (next) refused.clear();
  writeFlag(KEY, next ? "on" : "off");
  announce();
}
/** Hold every task on its standard model, whatever it is on (a Lab
 * benchmark), or let go. Running tasks load the other file when it changes. */
export function holdStandardModel(hold: boolean) {
  if (hold === standardOnly) return;
  standardOnly = hold;
  announce();
}
/** Whether a Lab benchmark is holding the standard model now. */
export const standardModelHeld = (): boolean => standardOnly;
/** Called when the choice changes. Returns the unsubscribe function. */
export function onModelChoice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How many runners are watching the switch (leak check for tests). */
export const modelChoiceWatchers = () => listeners.size;

/** The runner says which delegate its task is on, at every start. */
export const noteDelegate = (kind: TaskKind, delegate: Delegate) => {
  inUse.set(kind, delegate);
};
/** The delegate this kind's runner is on now, if one has started. */
export const delegateInUse = (kind: TaskKind): Delegate | undefined =>
  inUse.get(kind);
/** Give up the larger model of this kind for the rest of the page session. */
export const refuseGpuModel = (kind: TaskKind, reason: string) => {
  refused.set(kind, reason);
};
/** Why this kind's larger model was given up on this page, or null. */
export const gpuModelRefusal = (kind: TaskKind): string | null =>
  refused.get(kind) ?? null;

/** The larger model this task runs on `delegate` (by default the one its
 * runner is on now), or null when its standard model is the one to run. */
export function gpuModelFor(
  spec: Partial<Pick<TaskSpec, "kind" | "gpuModel">>,
  delegate?: Delegate,
): string | null {
  if (!spec.gpuModel || !spec.kind) return null;
  return (delegate ?? inUse.get(spec.kind)) === "GPU" &&
    largerOnGpu() &&
    !standardOnly &&
    !refused.has(spec.kind)
    ? spec.gpuModel
    : null;
}

/** The middle of the latencies collected so far (ms). */
export function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    half = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
}

/** Test hook: forget the stored value, the hold, the delegates and the
 * refusals. */
export const resetModelChoice = () => {
  on = undefined;
  standardOnly = false;
  inUse.clear();
  refused.clear();
};
