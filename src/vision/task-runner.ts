import { telemetry } from "../telemetry/bus";
import { fallbackDelegate } from "./delegate";
import type { Delegate, TaskResult, TaskSpec } from "./types";

// Inference is capped near 15 fps per task, as in v1.
const MIN_FRAME_GAP = 65;

export type RunnerEvents = {
  onReady(): void;
  onResult(result: TaskResult): void;
  onError(message: string): void;
};
/** Owns one vision worker for one task: start, one in-flight frame at a time,
 * a GPU to CPU restart when GPU never gets going, and teardown. */
export type TaskRunner = {
  readonly spec: TaskSpec;
  /** The delegate in use right now (differs from spec.delegate after a fallback). */
  delegate(): Delegate;
  ready(): boolean;
  /** True when the worker can take a frame at this animation time. */
  wants(time: number): boolean;
  /** Reserve the worker before the bitmap exists, so nothing else claims it. */
  claim(time: number): void;
  /** Give the claim back when no bitmap could be made. */
  release(): void;
  /** Transfer the bitmap to the worker. The worker closes it. */
  send(
    bitmap: ImageBitmap,
    time: number,
    generation: number,
    confidence: number,
  ): void;
  dispose(): void;
};
type WorkerLike = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror"
>;

export function createTaskRunner(
  spec: TaskSpec,
  base: string,
  events: RunnerEvents,
  // Injectable so the fallback path can be tested without a browser.
  spawn: (url: string) => WorkerLike = (url) => new Worker(url),
): TaskRunner {
  let worker: WorkerLike | null = null,
    active: Delegate = spec.delegate,
    ready = false,
    busy = false,
    produced = false,
    disposed = false,
    lastFrame = 0,
    started = 0;

  const stop = () => {
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    try {
      worker.terminate();
    } catch {
      /* A worker that already died needs no cleanup. */
    }
    worker = null;
  };
  const fail = (message: string) => {
    busy = false;
    ready = false;
    const retry = fallbackDelegate(active, produced);
    if (!retry) {
      events.onError(message);
      return;
    }
    // GPU never produced a frame: start over on CPU with a fresh worker.
    console.warn(
      `[spectra vision] ${spec.kind}: ${active} failed (${message}); using ${retry}.`,
    );
    stop();
    active = retry;
    start();
  };
  const start = () => {
    started = performance.now();
    try {
      worker = spawn(`${base}vision-worker.js`);
    } catch {
      events.onError(
        "Vision worker failed. Retry or use a current Chrome/Edge browser.",
      );
      return;
    }
    worker.onmessage = (event: MessageEvent) => {
      if (disposed) return;
      const message = event.data;
      if (message.type === "ready") {
        ready = true;
        telemetry.emit("model", {
          kind: spec.kind,
          requested: spec.delegate,
          delegate: active,
          loadMs: performance.now() - started,
        });
        events.onReady();
      } else if (message.type === "result") {
        busy = false;
        produced = true;
        const result = message.result as TaskResult;
        // The runner, not the worker, is the authority on what it is running.
        result.kind = spec.kind;
        result.delegate = active;
        telemetry.emit("inference", {
          kind: result.kind,
          latency: result.latency,
          time: result.time,
          delegate: active,
        });
        events.onResult(result);
      } else if (message.type === "error") fail(message.error);
    };
    worker.onerror = () => {
      if (disposed) return;
      fail("Vision worker failed. Retry or use a current Chrome/Edge browser.");
    };
    worker.postMessage({
      type: "init",
      base,
      task: { ...spec, delegate: active },
    });
  };
  start();

  return {
    spec,
    delegate: () => active,
    ready: () => ready,
    wants: (time) => ready && !busy && time - lastFrame >= MIN_FRAME_GAP,
    claim(time) {
      busy = true;
      lastFrame = time;
    },
    release() {
      busy = false;
    },
    send(bitmap, time, generation, confidence) {
      if (!worker) {
        bitmap.close();
        busy = false;
        return;
      }
      worker.postMessage(
        { type: "frame", bitmap, time, generation, confidence },
        [bitmap],
      );
    },
    dispose() {
      disposed = true;
      ready = false;
      stop();
    },
  };
}
