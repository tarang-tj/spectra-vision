import type { Delegate, TaskKind, TaskSpec } from "./types";
import { probeWebgl } from "./webgl-probe";

/** Decide how to recover when a vision task fails. A GPU task is retried once
 * on CPU, whether or not it had produced results (a lost context, a driver
 * reset or a tab moved to another GPU breaks a task that worked). A CPU
 * failure is a real error, and because a task that fell back is on CPU, it
 * can never fall back twice. Returns the delegate to retry with, or null to
 * surface the error. */
export function fallbackDelegate(active: Delegate): Delegate | null {
  return active === "GPU" ? "CPU" : null;
}

/** How long a GPU task may take to load before it is given up on, counted
 * from the moment the worker reports that the model and wasm bytes are in
 * (its "downloaded" message). A slow connection is not held against the GPU. */
export const GPU_READY_LIMIT_MS = 8000;
/** How long the first GPU frame may take (shader compilation happens here). */
export const GPU_FIRST_RESULT_LIMIT_MS = 5000;

export type StartProgress = {
  active: Delegate;
  ready: boolean;
  produced: boolean;
  /** Milliseconds since the worker was started. */
  sinceStart: number;
  /** Milliseconds since the first frame was sent, or null if none was. */
  sinceFirstFrame: number | null;
};

/** The time-bounded part of the GPU start. Returns the reason to give up on
 * GPU and restart on CPU, or null to keep waiting. A hung GPU start posts no
 * error, so without this bound it would sit until the 45 s load timeout. CPU
 * is never timed out here, and neither is a GPU task that already works. */
export function gpuStartTimeout(progress: StartProgress): string | null {
  const { active, ready, produced, sinceStart, sinceFirstFrame } = progress;
  if (active !== "GPU" || produced) return null;
  if (!ready)
    return sinceStart >= GPU_READY_LIMIT_MS
      ? `GPU did not load within ${GPU_READY_LIMIT_MS / 1000} s`
      : null;
  return sinceFirstFrame !== null &&
    sinceFirstFrame >= GPU_FIRST_RESULT_LIMIT_MS
    ? `GPU gave no result within ${GPU_FIRST_RESULT_LIMIT_MS / 1000} s of its first frame`
    : null;
}

/** Why a renderer of this name cannot serve the GPU delegate, or null when it
 * can. A software renderer (SwiftShader, llvmpipe, lavapipe, WARP, Mesa OffScreen,
 * Generic Renderer) does run the GPU path, but
 * so slowly that one abandoned start keeps the browser's GPU process busy long
 * after the fallback (measured: 16 s to minutes), and a worker cannot be
 * interrupted inside that call. So it is refused before it starts. */
export function softwareRendererReason(name: string | null): string | null {
  if (name === null) return "this browser gave no WebGL2 context";
  return /swiftshader|llvmpipe|lavapipe|softpipe|\bwarp\b|mesa offscreen|generic renderer|software|basic render/i.test(
    name,
  )
    ? `this browser draws WebGL in software (${name})`
    : null;
}

let refusal: string | null | undefined;

/** Why GPU cannot be used on this page, or null when it can be tried. Asked
 * only when a task requests GPU; the answer is kept. The renderer name comes
 * from the page's one WebGL probe (webgl-probe.ts). */
export function gpuUnavailable(): string | null {
  if (refusal !== undefined) return refusal;
  // Nothing known (no document, or the probe failed): GPU is tried.
  const probe = probeWebgl();
  refusal = probe
    ? softwareRendererReason(probe.webgl2 ? probe.renderer : null)
    : null;
  return refusal;
}

/** What "AUTO" means on this page: GPU only when the WebGL2 probe named a
 * renderer and that renderer is not a software one. A browser that hides the
 * renderer name, has no WebGL2 or has not been probed (unit tests, workers)
 * gets CPU: GPU is chosen only on evidence, never on a guess. */
export function autoDelegate(): Delegate {
  const probe = probeWebgl();
  if (!probe || !probe.webgl2 || !probe.renderer) return "CPU";
  return softwareRendererReason(probe.renderer) ? "CPU" : "GPU";
}

// The lab's delegate switch: one choice per task kind, kept for the page's
// lifetime only. With no choice a task runs on the delegate its mode asks for.
const choices = new Map<TaskKind, Delegate>(),
  watchers = new Set<(kind: TaskKind) => void>();

// GPU failures seen on this page, per task kind, with the reason. A runner
// that starts while one is on record begins on CPU instead of repeating it.
const gpuFailures = new Map<TaskKind, string>();

/** Record that GPU failed for this kind, so the next runner starts on CPU. */
export const rememberGpuFailure = (kind: TaskKind, reason: string) => {
  gpuFailures.set(kind, reason);
};

/** Why GPU failed earlier on this page for this kind, or null. */
export const gpuFailure = (kind: TaskKind): string | null =>
  gpuFailures.get(kind) ?? null;

/** The delegate a task should start on: the lab's choice, else the mode's
 * (with "AUTO" settled by autoDelegate). Always a real delegate. */
export function requestedDelegate(
  spec: Pick<TaskSpec, "kind" | "delegate">,
): Delegate {
  const asked = choices.get(spec.kind) ?? spec.delegate;
  return asked === "AUTO" ? autoDelegate() : asked;
}

/** Choose a delegate for a task kind (null: back to the mode's own choice).
 * Running tasks of that kind restart on it. Choosing GPU also clears the
 * remembered GPU failure and tries again, even if GPU was already chosen. */
export function chooseDelegate(kind: TaskKind, delegate: Delegate | null) {
  const retry = delegate === "GPU" && gpuFailures.delete(kind);
  if ((choices.get(kind) ?? null) === delegate && !retry) return;
  if (delegate) choices.set(kind, delegate);
  else choices.delete(kind);
  for (const watcher of [...watchers]) watcher(kind);
}

/** The lab's current choice for a kind, or null when the mode decides. */
export const chosenDelegate = (kind: TaskKind): Delegate | null =>
  choices.get(kind) ?? null;

/** Called when a choice changes. Returns the unsubscribe function. */
export function onDelegateChoice(watcher: (kind: TaskKind) => void) {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

/** How many runners are watching the switch (leak check for tests). */
export const delegateWatchers = () => watchers.size;
