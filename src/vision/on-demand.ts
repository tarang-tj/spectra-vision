/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Tasks a mode runs only when they are wanted (`ModeDef.onDemand`): Objects'
// depth map for Measure objects. A slot has a worker only while its task's
// `wanted` says so, makes one result per picture, and keeps to itself: its
// loading, its failure and its latency never reach the mode's own status,
// error or readout. `tasksOf(mode)` does not list these tasks.
import type { FrameHolder } from "./held-frame";
import { createTaskRunner, type TaskRunner } from "./task-runner";
import type {
  Source,
  TaskKind,
  TaskResult,
  TaskSpec,
  VisionResult,
} from "./types";

export type OnDemandTask = {
  spec: TaskSpec;
  /** Should this task run for this source right now? */
  wanted(source: Source | null): boolean;
  /** Called when the answer to `wanted` may have changed. It may be called
   * far more often than the answer changes. */
  subscribe(listener: () => void): () => void;
};
export type OnDemandState =
  | { state: "idle" } // not wanted
  | { state: "loading" }
  | { state: "mapping" } // loaded, no result for this picture yet
  | { state: "ready" }
  | { state: "failed"; note: string };

const IDLE: OnDemandState = { state: "idle" };
const states = new Map<TaskKind, OnDemandState>(),
  watchers = new Set<() => void>();
/** Where the on-demand task of this kind stands, for the page to say. */
export const onDemandState = (kind: TaskKind): OnDemandState =>
  states.get(kind) ?? IDLE;
export function onOnDemandState(listener: () => void) {
  watchers.add(listener);
  return () => {
    watchers.delete(listener);
  };
}
function setState(kind: TaskKind, next: OnDemandState) {
  const now = onDemandState(kind);
  if (now.state === next.state && !("note" in next)) return;
  states.set(kind, next);
  for (const watcher of [...watchers]) watcher();
}

type Live = { source: Source | null; confidence: number };
/** Hand one frame of the source to a runner that claimed it. Each worker
 * gets its own bitmap because a bitmap is transferred, not shared. `live`
 * gives the page's current source and confidence, or null once it stopped. */
export async function feedFrame(
  runner: TaskRunner,
  holder: FrameHolder | null,
  generation: number,
  live: () => Live | null,
  unreadable: () => void,
) {
  const state = live();
  try {
    const element = state!.source!.element,
      bitmap = await createImageBitmap(element);
    if (generation !== live()?.source?.generation) {
      bitmap.close();
      runner.release();
      return;
    }
    const now = performance.now();
    // A still picture never moves on, so there is nothing to hold.
    if (element instanceof HTMLVideoElement) holder?.capture(bitmap, now);
    runner.send(bitmap, now, generation, state!.confidence);
  } catch {
    runner.release();
    if (live()) unreadable();
  }
}

export type OnDemandHooks = {
  /** A slot's result came, went or needs showing again: hand the page its
   * latest result once more, through `attach`. */
  changed(): void;
  /** Read the current frame and send it to this claimed runner. */
  feed(runner: TaskRunner, generation: number): void;
};

export function createOnDemand(
  tasks: readonly OnDemandTask[],
  base: string,
  hooks: OnDemandHooks,
  // Injectable, as the task runner's is.
  spawn?: Parameters<typeof createTaskRunner>[3],
) {
  let source: Source | null = null,
    disposed = false;
  const slots = tasks.map((task) => {
    const { kind } = task.spec;
    let runner: TaskRunner | null = null,
      result: TaskResult | null = null,
      offRestate: (() => void) | undefined;
    const drop = () => {
      if (!result) return;
      result = null;
      if (!disposed) hooks.changed();
    };
    const stop = () => {
      offRestate?.();
      runner?.dispose();
      runner = null;
      setState(kind, IDLE);
      drop();
    };
    const begin = () => {
      setState(kind, { state: "loading" });
      runner = createTaskRunner(
        task.spec,
        base,
        {
          onReady: () => setState(kind, { state: "mapping" }),
          // A delegate switch or a fallback loads the model again.
          onRestart() {
            setState(kind, { state: "loading" });
            drop();
          },
          onResult(taskResult) {
            // A map of a picture that has since been replaced is not kept.
            if (disposed || taskResult.generation !== source?.generation)
              return;
            result = taskResult;
            setState(kind, { state: "ready" });
            hooks.changed();
          },
          // Said by this task's own state, never as the mode's error.
          onError(note) {
            setState(kind, { state: "failed", note });
            drop();
          },
        },
        spawn,
      );
      // What the mode shows for this result changed without a new one.
      offRestate = task.spec.restate?.(() => {
        if (!disposed && result) hooks.changed();
      });
    };
    // Acts only when the answer flips: the Ruler calls on every drag.
    const look = () => {
      if (disposed) return;
      const wanted = task.wanted(source);
      if (wanted && !runner) begin();
      else if (!wanted && runner) stop();
    };
    const off = task.subscribe(look);
    return {
      kind,
      look,
      newPicture() {
        drop();
        if (onDemandState(kind).state === "ready")
          setState(kind, { state: "mapping" });
        look();
      },
      tick(time: number, paused: boolean) {
        // One frame per picture, and never one of a video: a map of a
        // moving picture would describe an earlier frame.
        if (!runner || result || paused || !source) return;
        if (!("naturalWidth" in source.element) || !runner.wants(time)) return;
        runner.claim(time);
        hooks.feed(runner, source.generation);
      },
      result: () => result,
      dispose() {
        off();
        stop();
      },
    };
  });
  return {
    /** Once per drawn frame, from the page's own tick. */
    tick(time: number, now: Source | null, paused: boolean) {
      const fresh = now?.generation !== source?.generation;
      source = now;
      for (const slot of slots) {
        if (fresh) slot.newPicture();
        slot.tick(time, paused);
      }
    },
    /** The result with each slot's map of the same picture under
     * `tasks[kind]`, and without one that is not. Nothing else changes:
     * the latency and the flat fields stay the mode's own. */
    attach(shown: VisionResult): VisionResult {
      let tasks = shown.tasks;
      for (const slot of slots) {
        const mine = slot.result(),
          fits = mine?.generation === shown.generation ? mine : undefined;
        if (tasks[slot.kind] === fits) continue;
        tasks = { ...tasks };
        if (fits) tasks[slot.kind] = fits;
        else delete tasks[slot.kind];
      }
      return tasks === shown.tasks ? shown : { ...shown, tasks };
    },
    dispose() {
      disposed = true;
      slots.forEach((slot) => slot.dispose());
    },
  };
}
