/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Delegate, TaskKind } from "../vision/types";

/** What one task runner last measured about its own start. Written by the
 * runner a few times per model load (never per frame) and read by the lab,
 * so a load that happened while the lab was closed is still on record. */
export type TaskStatus = {
  kind: TaskKind;
  model: string;
  /** What was asked for: the mode's own choice or the lab's delegate switch. */
  requested: Delegate;
  /** What is running now. Differs from `requested` after a fallback. */
  active: Delegate;
  state: "loading" | "ready" | "failed";
  /** Worker start to "ready" (includes the runtime and model download). */
  loadMs: number | null;
  /** Worker start to the first result (includes waiting for a first frame). */
  firstResultMs: number | null;
  /** Why the active delegate is not the requested one, or why it failed. */
  note: string;
  /** Increases on every (re)start, so a waiter can tell a fresh load. */
  load: number;
};

const statuses = new Map<string, TaskStatus>();
let loads = 0;

const key = (kind: TaskKind, model: string) => `${kind}:${model}`;

/** Start a fresh record for a (re)started worker. */
export function beginStatus(
  kind: TaskKind,
  model: string,
  requested: Delegate,
  active: Delegate,
  note: string,
): TaskStatus {
  const status: TaskStatus = {
    kind,
    model,
    requested,
    active,
    state: "loading",
    loadMs: null,
    firstResultMs: null,
    note,
    load: ++loads,
  };
  statuses.set(key(kind, model), status);
  return status;
}

/** The latest record for this model, or null if it never started. */
export function taskStatus(kind: TaskKind, model: string): TaskStatus | null {
  return statuses.get(key(kind, model)) ?? null;
}

/** How many loads have started so far: a mark to tell later loads from. */
export const loadCount = () => loads;
