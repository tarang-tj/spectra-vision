import { telemetry } from "../telemetry/bus";
import { beginStatus } from "../telemetry/task-status";
import {
  chosenDelegate,
  fallbackDelegate,
  gpuFailure,
  rememberGpuFailure,
  gpuStartTimeout,
  gpuUnavailable,
  onDelegateChoice,
  requestedDelegate,
} from "./delegate";
import { modelOf, onPrecisionChange } from "./settings";
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
 * a GPU to CPU restart when GPU fails (before or after it worked) or does not
 * get going in bounded time,
 * a restart when the lab switches the delegate, and teardown. */
export type TaskRunner = {
  readonly spec: TaskSpec;
  /** The delegate in use right now (differs from the requested one after a fallback). */
  delegate(): Delegate;
  /** The model file in use (the precise one while Precision asks for it). */
  model(): string;
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
    requested: Delegate = requestedDelegate(spec),
    active: Delegate = requested,
    // The file this worker loads: the task's model, or its precise one while
    // the Precision setting asks for it.
    model = modelOf(spec),
    ready = false,
    busy = false,
    produced = false,
    disposed = false,
    lastFrame = 0,
    started = 0,
    // Whether the worker has reported that the model and wasm bytes arrived,
    // and when. The GPU start is timed from that moment.
    downloaded = false,
    clock = 0,
    firstSent = 0,
    watchdog: ReturnType<typeof setTimeout> | undefined,
    note = "",
    // True while this runner is on CPU because GPU failed (here or earlier).
    failedOver = false;
  // Settle what to run on: the requested delegate, unless GPU is requested
  // where it is known not to be usable. Then it is CPU from the start.
  const choose = () => {
    requested = requestedDelegate(spec);
    const refused = requested === "GPU" ? gpuUnavailable() : null,
      // A GPU failure earlier on this page stands until the Lab's GPU choice
      // clears it; an explicit GPU choice is never overridden by it.
      failed =
        requested === "GPU" && chosenDelegate(spec.kind) !== "GPU"
          ? gpuFailure(spec.kind)
          : null;
    active = refused || failed ? "CPU" : requested;
    failedOver = !refused && !!failed;
    note = refused
      ? `GPU was requested but ${refused}. Running on CPU.`
      : failed
        ? `GPU failed earlier on this page (${failed}). Running on CPU. Choose GPU in the Lab to try again.`
        : "";
  };
  choose();
  let status = beginStatus(spec.kind, model, requested, active, note);

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
    const retry = fallbackDelegate(active);
    if (!retry && model !== spec.model && !produced) {
      // The precise model never produced a frame (offline on first use, a
      // failed download): run the standard one and say so, so a saved
      // Precise choice cannot leave the mode broken on every visit.
      console.warn(
        `[spectra vision] ${spec.kind}: ${model} failed (${message}); using ${spec.model}.`,
      );
      stop();
      model = spec.model;
      note = `The precise model did not load (${message}). Running the standard model.`;
      events.onRestart?.();
      start();
      return;
    }
    if (!retry) {
      status.state = "failed";
      status.note = message;
      events.onError(message);
      return;
    }
    // GPU failed: start over on CPU with a fresh worker, and remember it so
    // the next runner of this kind does not repeat the failure.
    console.warn(
      `[spectra vision] ${spec.kind}: ${active} failed (${message}); using ${retry}.`,
    );
    stop();
    const reason = message.replace(/^Vision model failed: /, "");
    rememberGpuFailure(spec.kind, reason);
    note = produced
      ? `GPU stopped working (${reason}). Now running on ${retry}.`
      : `${active} was requested but ${reason}. Running on ${retry}.`;
    produced = false;
    failedOver = true;
    active = retry;
    events.onRestart?.();
    start();
  };
  // The bounded GPU start: checked on a timer only while a GPU task is still
  // loading or still owes its first result, never once it works or on CPU.
  const watch = () => {
    clearTimeout(watchdog);
    // Nothing is timed while the files download: a slow connection says
    // nothing about the GPU (the mode's own load timeout still applies).
    if (
      disposed ||
      active !== "GPU" ||
      produced ||
      (!ready && !downloaded) ||
      (ready && !firstSent)
    )
      return;
    const now = performance.now(),
      reason = gpuStartTimeout({
        active,
        ready,
        produced,
        sinceStart: now - clock,
        sinceFirstFrame: firstSent ? now - firstSent : null,
      });
    if (reason) fail(reason);
    else watchdog = setTimeout(watch, 250);
  };
  const start = () => {
    started = performance.now();
    downloaded = false;
    firstSent = 0;
    status = beginStatus(spec.kind, model, requested, active, note);
    try {
      // Depth runs on another runtime, in a worker script of its own.
      worker = spawn(
        `${base}${spec.kind === "depth" ? "depth-worker.js" : "vision-worker.js"}`,
      );
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
      if (message.type === "progress") {
        // A large model is still downloading (the Depth worker says so every
        // few seconds). The page counts its load timeout from the last sign
        // that the task is loading, so a slow connection is not a failure.
        if (!ready) events.onRestart?.();
      } else if (message.type === "downloaded") {
        // The download is not the GPU's doing: bound only what follows it.
        downloaded = true;
        clock = performance.now();
        watch();
      } else if (message.type === "ready") {
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
        result.model = model;
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
    // `live` holds functions, which cannot be posted: its current values are
    // folded into the options instead.
    const { live, ...plain } = spec;
    worker.postMessage({
      type: "init",
      base,
      task: {
        ...plain,
        options: { ...spec.options, ...live?.current() },
        model,
        delegate: active,
      },
    });
    watch();
  };
  start();
  // A live option (such as how many people to follow) changed: tell the
  // running worker. One that is still loading keeps the message until its
  // task exists (public/vision-worker.js).
  const unwatchLive = spec.live?.subscribe(() => {
    if (disposed || !worker) return;
    worker.postMessage({ type: "options", options: spec.live!.current() });
  });
  // The lab's delegate switch: load this task again on the delegate chosen.
  const unwatch = onDelegateChoice((kind) => {
    const next = requestedDelegate(spec);
    // The same request still restarts a runner that failed over, so a
    // renewed GPU choice in the Lab tries GPU again.
    if (disposed || kind !== spec.kind || (next === requested && !failedOver))
      return;
    stop();
    choose();
    ready = busy = produced = false;
    events.onRestart?.();
    start();
  });

  // The Precision setting: load the other model for this task, if it has one.
  const unwatchPrecision = onPrecisionChange(() => {
    const next = modelOf(spec);
    if (disposed || next === model) return;
    stop();
    model = next;
    ready = busy = produced = false;
    events.onRestart?.();
    start();
  });

  return {
    spec,
    delegate: () => active,
    model: () => model,
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
      unwatchPrecision();
      unwatchLive?.();
      stop();
    },
  };
}
