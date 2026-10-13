/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The scorecard's own client for the two detector worker scripts. It speaks
// their `init` and `frame` messages directly (public/vision-worker.js,
// public/detector-worker.js) and goes round the task runner on purpose: a
// run here must not move the Lab's live figures, and a row must be the file
// and delegate it names or a failure. There is no second attempt and no
// fallback to another delegate or model.
import { SHARPER_MODEL, workerScript } from "../../../vision/detector/sharper";
import type { Delegate } from "../../../vision/types";
import type { Box } from "./iou";
import type { Scored } from "./match";

/** Every model is read down to this score, so no model's AP has a longer tail. */
export const FLOOR = 0.05;
/** The most boxes taken from one picture. */
export const MAX_BOXES = 100;
/** How far under the Confidence value the Sharper worker decodes
 * (KEEP_BELOW in public/detector-worker.js). */
const SHARPER_BAND = 0.15;
/** What the Sharper worker is sent as its floor: its decode floor is this
 * less the band, which must stay above 0 or every box is dropped. */
export const SHARPER_SEND = FLOOR + SHARPER_BAND;

export const MODELS = [
  { file: "efficientdet_lite0.tflite", label: "EfficientDet-Lite0" },
  { file: "efficientdet_lite2.tflite", label: "EfficientDet-Lite2" },
  { file: SHARPER_MODEL, label: "Sharper, D-FINE-S" },
] as const;

/** One row of the scorecard: this file on this delegate, said outright. */
export type Target = {
  id: string;
  label: string;
  model: string;
  delegate: Delegate;
  script: string;
  options: Record<string, unknown>;
  /** The `confidence` sent with every picture. */
  send: number;
  floor: number;
  /** True for Sharper: its band under `send` comes back in `extra.faint`. */
  sharper: boolean;
};

/** The rows for the chosen models and delegates. Sharper has no CPU row. */
export function targetsFor(
  models: readonly string[],
  delegates: readonly Delegate[],
  bytes: (file: string) => number | null = () => null,
): Target[] {
  const targets: Target[] = [];
  for (const { file, label } of MODELS) {
    if (!models.includes(file)) continue;
    const sharper = file === SHARPER_MODEL;
    for (const delegate of delegates) {
      if (sharper && delegate !== "GPU") continue;
      targets.push({
        id: `${file}:${delegate}`,
        label,
        model: file,
        delegate,
        script: workerScript("object", file),
        options: sharper
          ? {
              size: 640,
              minScore: SHARPER_SEND,
              maxResults: MAX_BOXES,
              bytes: bytes(file) ?? undefined,
            }
          : { scoreThreshold: FLOOR, maxResults: MAX_BOXES },
        send: sharper ? SHARPER_SEND : FLOOR,
        floor: FLOOR,
        sharper,
      });
    }
  }
  return targets;
}

type Detection = { label?: unknown; score?: unknown; box?: Partial<Box> };
type Result = {
  latency?: unknown;
  detections?: Detection[];
  extra?: { faint?: Detection[] };
};

/** The boxes of one worker answer, as fractions of the picture: the band
 * under the gate is added for Sharper only, anything under the floor is
 * dropped, and the strongest MAX_BOXES are kept in the worker's order. */
export function readBoxes(target: Target, result: Result): Scored[] {
  const all = [
    ...(result.detections ?? []),
    ...(target.sharper ? (result.extra?.faint ?? []) : []),
  ];
  const boxes: Scored[] = [];
  for (const { label, score, box } of all) {
    const sides = [box?.x, box?.y, box?.w, box?.h];
    if (typeof label !== "string" || typeof score !== "number") continue;
    if (!(score >= target.floor) || !sides.every(Number.isFinite)) continue;
    boxes.push({ label, score, box: box as Box });
  }
  return boxes.sort((a, b) => b.score - a.score).slice(0, MAX_BOXES);
}

/** How long each wait may last, in ms: the downloads, the start once the
 * bytes are in (what Sharper is given on the stage), and one picture. */
export const LIMITS = { download: 60_000, start: 30_000, picture: 30_000 };
type WorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
export type MakeWorker = (url: string) => WorkerLike;
export type ScoreWorker = {
  /** Resolves when the model is loaded; rejects with the reason it is not. */
  ready(): Promise<void>;
  detect(bitmap: ImageBitmap): Promise<{ boxes: Scored[]; latency: number }>;
  close(): void;
};

/** Open one worker for one target. Any `error` message, a worker that
 * fails, or a wait that runs out ends it: every later call rejects with
 * that first reason. */
export function openScoreWorker(
  target: Target,
  base: string,
  make: MakeWorker = (url) => new Worker(url),
  limits = LIMITS,
): ScoreWorker {
  const worker = make(`${base}${target.script}`);
  type Wait = {
    want: string;
    resolve(message: { result?: Result }): void;
    reject(error: Error): void;
  };
  let waiting: Wait | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    dead: Error | null = null,
    time = 0;
  const fail = (reason: string) => {
    dead ??= new Error(reason);
    clearTimeout(timer);
    waiting?.reject(dead);
    waiting = null;
  };
  const arm = (ms: number, what: string) => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fail(`${what} within ${Math.round(ms / 1000)} s`),
      ms,
    );
  };
  const expect = (want: string, ms: number, what: string) =>
    new Promise<{ result?: Result }>((resolve, reject) => {
      if (dead) return reject(dead);
      waiting = { want, resolve, reject };
      arm(ms, what);
    });
  worker.onmessage = ({ data }) => {
    if (data?.type === "error") return fail(String(data.error));
    if (data?.type === "downloaded" && waiting?.want === "ready")
      return arm(limits.start, "the model did not start");
    if (!waiting || data?.type !== waiting.want) return;
    clearTimeout(timer);
    const done = waiting;
    waiting = null;
    done.resolve(data);
  };
  worker.onerror = () => fail("the worker script failed");
  return {
    async ready() {
      const ready = expect(
        "ready",
        limits.download,
        "the model did not download",
      );
      const { model, delegate, options } = target;
      worker.postMessage({
        type: "init",
        base,
        task: { kind: "object", model, delegate, options },
      });
      await ready;
    },
    async detect(bitmap) {
      // A worker that failed is sent nothing more.
      if (dead) throw dead;
      const answer = expect(
        "result",
        limits.picture,
        "the model did not answer",
      );
      time += 100;
      worker.postMessage(
        { type: "frame", bitmap, time, generation: 0, confidence: target.send },
        [bitmap],
      );
      const result = (await answer).result ?? {};
      return {
        boxes: readBoxes(target, result),
        latency: Number(result.latency),
      };
    },
    close() {
      fail("stopped");
      worker.terminate();
    },
  };
}
