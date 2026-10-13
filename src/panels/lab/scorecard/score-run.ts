/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The scorecard's run loop: the stage is paused, each target gets a worker of
// its own, one pass that is thrown away, then every picture once. A target
// that cannot start or fails part way is a failed row with its reason; the
// loop never tries it again on another delegate or with another model.
import { toPixels } from "./iou";
import type { Scored } from "./match";
import type { ScoreSet, SetItem } from "./score-set";
import type { ScoreWorker, Target } from "./score-worker";

export type PictureRaw = { boxes: Scored[]; latency: number };
export type RunRaw = {
  target: Target;
  status: "ok" | "failed";
  /** Why the run failed; empty when it did not. */
  note: string;
  /** SHA-256 of the model file as the browser received it, or null. */
  sha256: string | null;
  /** One entry per picture, boxes in source pixels; empty for a failed run. */
  pictures: PictureRaw[];
};
export type RunResult = {
  set: ScoreSet;
  /** The pictures that were scored: the whole set, or its first few. */
  items: SetItem[];
  runs: RunRaw[];
  stopped: boolean;
};

/** Everything the loop touches outside itself, so a test can stand in. */
export type RunIo = {
  fetchSet(signal: AbortSignal): Promise<ScoreSet>;
  fetchPicture(item: SetItem, signal: AbortSignal): Promise<Blob>;
  bitmap(blob: Blob): Promise<ImageBitmap>;
  open(target: Target): ScoreWorker;
  hash(file: string): Promise<string | null>;
  /** Why this target cannot be tried here, or null. */
  refused(target: Target): string | null;
  paused(): boolean;
  setPaused(value: boolean): void;
};
export type Progress =
  | { step: "list" }
  | { step: "loading"; target: Target }
  | { step: "picture"; target: Target; index: number; of: number };

const reasonOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Vision model failed: /,
    "",
  );

async function runTarget(
  target: Target,
  items: SetItem[],
  io: RunIo,
  signal: AbortSignal,
  progress: (state: Progress) => void,
): Promise<PictureRaw[]> {
  const worker = io.open(target),
    stop = () => worker.close();
  signal.addEventListener("abort", stop);
  try {
    progress({ step: "loading", target });
    await worker.ready();
    const pass = async (item: SetItem) => {
      const blob = await io.fetchPicture(item, signal),
        { boxes, latency } = await worker.detect(await io.bitmap(blob));
      return {
        latency,
        boxes: boxes.map((box) => ({
          ...box,
          box: toPixels(box.box, item.width, item.height),
        })),
      };
    };
    // The first pass pays for what a model sets up on its first picture.
    await pass(items[0]);
    const pictures: PictureRaw[] = [];
    for (let i = 0; i < items.length; i++) {
      progress({ step: "picture", target, index: i + 1, of: items.length });
      pictures.push(await pass(items[i]));
    }
    return pictures;
  } finally {
    signal.removeEventListener("abort", stop);
    worker.close();
  }
}

/** Run every target over the set's pictures (the first `limit` of them in a
 * shortened test run). A stop keeps the runs that finished before it. */
export async function runScorecard(
  targets: readonly Target[],
  io: RunIo,
  signal: AbortSignal,
  progress: (state: Progress) => void,
  limit?: number,
): Promise<RunResult> {
  const wasPaused = io.paused();
  io.setPaused(true);
  try {
    progress({ step: "list" });
    const set = await io.fetchSet(signal),
      items = set.items.slice(0, limit ?? set.items.length),
      runs: RunRaw[] = [];
    for (const target of targets) {
      if (signal.aborted) break;
      const failed = (note: string): RunRaw => ({
        target,
        status: "failed",
        note,
        sha256: null,
        pictures: [],
      });
      const refusal = io.refused(target);
      if (refusal) {
        runs.push(failed(refusal));
        continue;
      }
      try {
        const pictures = await runTarget(target, items, io, signal, progress);
        runs.push({
          target,
          status: "ok",
          note: "",
          sha256: await io.hash(target.model),
          pictures,
        });
      } catch (error) {
        // A run cut short by Stop is not shown at all.
        if (signal.aborted) break;
        runs.push(failed(reasonOf(error)));
      }
    }
    return { set, items, runs, stopped: signal.aborted };
  } finally {
    io.setPaused(wasPaused);
  }
}
