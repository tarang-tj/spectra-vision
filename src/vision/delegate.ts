import type { Delegate, TaskKind, TaskSpec } from "./types";

/** Decide how to recover when a vision task fails. A GPU task that has not
 * produced a single result yet is retried once on CPU; anything else (a CPU
 * failure, or a GPU task that was working and then broke) is a real error.
 * Returns the delegate to retry with, or null to surface the error. */
export function fallbackDelegate(
  active: Delegate,
  produced: boolean,
): Delegate | null {
  return active === "GPU" && !produced ? "CPU" : null;
}

/** How long a GPU task may take to load before it is given up on. The load
 * includes the runtime and model download, so this is the bound a slow
 * connection has to beat too. */
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
 * can. A software renderer (SwiftShader, llvmpipe) does run the GPU path, but
 * so slowly that one abandoned start keeps the browser's GPU process busy long
 * after the fallback (measured: 16 s to minutes), and a worker cannot be
 * interrupted inside that call. So it is refused before it starts. */
export function softwareRendererReason(name: string | null): string | null {
  if (name === null) return "this browser gave no WebGL2 context";
  return /swiftshader|llvmpipe|software|basic render/i.test(name)
    ? `this browser draws WebGL in software (${name})`
    : null;
}

let refusal: string | null | undefined;

/** Why GPU cannot be used on this page, or null when it can be tried. Asked
 * only when a task requests GPU; the answer is kept. It opens one throwaway
 * WebGL context to read the renderer name and releases it at once. */
export function gpuUnavailable(): string | null {
  if (refusal !== undefined) return refusal;
  refusal = null;
  try {
    // No document (unit tests, workers): nothing is known, so GPU is tried.
    if (typeof document === "undefined") return refusal;
    const gl = document.createElement("canvas").getContext("webgl2"),
      info = gl?.getExtension("WEBGL_debug_renderer_info"),
      name =
        gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    refusal = softwareRendererReason(gl ? name : null);
  } catch {
    /* The probe failing says nothing about the delegate: let it try. */
  }
  return refusal;
}

// The lab's delegate switch: one choice per task kind, kept for the page's
// lifetime only. With no choice a task runs on the delegate its mode asks for.
const choices = new Map<TaskKind, Delegate>(),
  watchers = new Set<(kind: TaskKind) => void>();

/** The delegate a task should start on: the lab's choice, else the mode's. */
export function requestedDelegate(
  spec: Pick<TaskSpec, "kind" | "delegate">,
): Delegate {
  return choices.get(spec.kind) ?? spec.delegate;
}

/** Choose a delegate for a task kind (null: back to the mode's own choice).
 * Running tasks of that kind restart on it. */
export function chooseDelegate(kind: TaskKind, delegate: Delegate | null) {
  if ((choices.get(kind) ?? null) === delegate) return;
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
