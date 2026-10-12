/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Two page-wide settings that change how landmarks are measured, kept in
// localStorage so they are remembered on this device and never leave it:
//   smoothing  filter the landmarks that are DRAWN (the session export and the
//              result feed always keep the raw values). On by default.
//   precision  "fast" runs each task's `model`; "precise" runs its
//              `preciseModel` where it has one. Fast by default, so CI and
//              slow machines keep the small models on CPU. On Fast, a task
//              that names a `gpuModel` runs that on a real GPU
//              (model-choice.ts).
import { useSyncExternalStore } from "react";
import { readFlag, writeFlag } from "../shell/storage";
import { gpuModelFor } from "./model-choice";
import type { Delegate, TaskSpec } from "./types";

export type Precision = "fast" | "precise";

type Setting<T> = {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
};

/** A value that is read from storage on first use, written on change and
 * announced to subscribers. An unreadable or unknown stored value is ignored. */
function createSetting<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): Setting<T> {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  // Plain closures, not methods, so `setPrecision = precision.set` is safe.
  const get = (): T => {
    if (value === undefined) {
      const stored = readFlag(key) as T | null;
      value = stored !== null && allowed.includes(stored) ? stored : fallback;
    }
    return value;
  };
  return {
    get,
    set(next) {
      if (next === get()) return;
      value = next;
      writeFlag(key, next);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const smoothing = createSetting("spectra.smooth.v1", "on", ["off", "on"]),
  precision = createSetting<Precision>("spectra.precision.v1", "fast", [
    "fast",
    "precise",
  ]);

export const smoothingOn = (): boolean => smoothing.get() === "on";
export const setSmoothing = (on: boolean) => smoothing.set(on ? "on" : "off");
/** Smoothing as React state: [on, set]. */
export function useSmoothing(): [boolean, (on: boolean) => void] {
  useSyncExternalStore(smoothing.subscribe, smoothing.get);
  return [smoothingOn(), setSmoothing];
}

export const getPrecision = (): Precision => precision.get();
export const setPrecision = precision.set;
export const onPrecisionChange = precision.subscribe;
export function usePrecision(): [Precision, (value: Precision) => void] {
  return [
    useSyncExternalStore(precision.subscribe, precision.get),
    precision.set,
  ];
}

/** The model file a task runs under the current Precision setting. On Fast,
 * a task that names a larger model for a real GPU runs it there
 * (model-choice.ts); `delegate` defaults to the one its runner is on now. */
export const modelOf = (
  spec: Pick<TaskSpec, "model" | "preciseModel"> &
    Partial<Pick<TaskSpec, "kind" | "gpuModel">>,
  level: Precision = precision.get(),
  delegate?: Delegate,
): string =>
  level === "precise" && spec.preciseModel
    ? spec.preciseModel
    : (gpuModelFor(spec, delegate) ?? spec.model);
