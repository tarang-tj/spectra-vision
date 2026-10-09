/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFlag, writeFlag } from "../../shell/storage";
import type { LiveOptions } from "../../vision/types";

// How many people Body mode follows at most. One by default, so the mode
// behaves as it always did until someone asks for more. Kept on this device
// only. Each extra person costs inference time (measured in the models report),
// so the ceiling is small and stated.
export const MAX_PEOPLE = 4;
const KEY = "spectra.people.v1";

let value: number | undefined;
const listeners = new Set<() => void>();

/** A stored value that is not a whole number from 1 to MAX_PEOPLE is ignored. */
export function parsePeople(stored: string | null): number {
  const n = Number(stored);
  return stored !== null && Number.isInteger(n) && n >= 1 && n <= MAX_PEOPLE
    ? n
    : 1;
}
export const getPeople = (): number => (value ??= parsePeople(readFlag(KEY)));
export function setPeople(next: number) {
  const n = parsePeople(String(next));
  if (n === getPeople()) return;
  value = n;
  writeFlag(KEY, String(n));
  for (const listener of [...listeners]) listener();
}
export function onPeopleChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Test hook: forget the cached value so storage is read again. */
export const resetPeople = () => {
  value = undefined;
};

/** The task option the runner keeps in step with the setting (vision/task-runner.ts). */
export const peopleOption: LiveOptions = {
  current: () => ({ numPoses: getPeople() }),
  subscribe: onPeopleChange,
};
