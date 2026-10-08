import { telemetry } from "../telemetry/bus";
import { beginStatus } from "../telemetry/task-status";
import {
  fallbackDelegate,
  gpuStartTimeout,
  gpuUnavailable,
  onDelegateChoice,
  requestedDelegate,
} from "./delegate";
import type { Delegate, TaskResult, TaskSpec } from "./types";

// Inference is capped near 15 fps per task, as in v1.
export const MIN_FRAME_GAP = 65;

export type RunnerEvents = {
  onReady(): void;
  /** The worker is being started again (a delegate switch or a GPU to CPU
   * fallback): the task is loading until the next onReady. */
  onRestart?(): void;
  onResult(result: TaskResult): void;
  onError(message: string): void;
};
/** Owns one vision worker for one task: start, one in-flight frame at a time,
 * a GPU to CPU restart when GPU fails or does not get going in bounded time,
 * a restart when the lab switches the delegate, and teardown. */
export type TaskRunner = {
  readonly spec: TaskSpec;
  /** The delegate in use right now (differs from the requested one after a fallback). */
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
    requested: Delegate = spec.delegate,
    active: Delegate = requested,
    ready = false,
    busy = false,
    produced = false,
    disposed = false,
    lastFrame = 0,
    started = 0,
    firstSent = 0,
    watchdog: ReturnType<typeof setTimeout> | undefined,
    note = "";
  // Settle what to run on: the requested delegate, unless GPU is requested
  // where it is known not to be usable. Then it is CPU from the start.
  const choose = () => {
    requested = requestedDelegate(spec);
    const refused = requested === "GPU" ? gpuUnavailable() : null;
    active = refused ? "CPU" : requested;
    note = refused ? `GPU was requested but ${refused}. Running on CPU.` : "";
  };
  choose();
  let status = beginStatus(spec.kind, spec.model, requested, active, note);

  const stop = () => {
    clearTimeout(watchdog);
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
      status.state = "failed";
      status.note = message;
      events.onError(message);
      return;
    }
    // GPU never produced a frame: start over on CPU with a fresh worker.
    console.warn(
      `[spectra vision] ${spec.kind}: ${active} failed (${message}); using ${retry}.`,
    );
    stop();
    note = `${active} was requested but ${message.replace(/^Vision model failed: /, "")}. Running on ${retry}.`;
    active = retry;
    events.onRestart?.();
    start();
  };
  // The bounded GPU start: checked on a timer only while a GPU task is still
  // loading or still owes its first result, never once it works or on CPU.
  const watch = () => {
    clearTimeout(watchdog);
    if (disposed || active !== "GPU" || produced || (ready && !firstSent))
      return;
    const now = performance.now(),
      reason = gpuStartTimeout({
        active,
        ready,
        produced,
        sinceStart: now - started,
        sinceFirstFrame: firstSent ? now - firstSent : null,
      });
    if (reason) fail(reason);
    else watchdog = setTimeout(watch, 250);
  };
  const start = () => {
    started = performance.now();
    firstSent = 0;
    status = beginStatus(spec.kind, spec.model, requested, active, note);
    try {
      worker = spawn(`${base}vision-worker.js`);
    } catch {
      status.state = "failed";
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
        status.state = "ready";
        status.loadMs = performance.now() - started;
        telemetry.emit("model", {
          kind: spec.kind,
          requested,
          delegate: active,
          loadMs: status.loadMs,
          note,
          files: Array.isArray(message.files) ? message.files : undefined,
        });
        events.onReady();
      } else if (message.type === "result") {
        busy = false;
        if (!produced) status.firstResultMs = performance.now() - started;
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
    watch();
  };
  start();
  // The lab's delegate switch: load this task again on the delegate chosen.
  const unwatch = onDelegateChoice((kind) => {
    const next = requestedDelegate(spec);
    if (disposed || kind !== spec.kind || next === requested) return;
    stop();
    choose();
    ready = busy = produced = false;
    events.onRestart?.();
    start();
  });

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
      // No worker, or one restarted since this frame was claimed: drop it.
      if (!worker || !ready) {
        bitmap.close();
        busy = false;
        return;
      }
      if (!produced && !firstSent) {
        firstSent = performance.now();
        watch();
      }
      worker.postMessage(
        { type: "frame", bitmap, time, generation, confidence },
        [bitmap],
      );
    },
    dispose() {
      disposed = true;
      ready = false;
      unwatch();
      stop();
    },
  };
}
