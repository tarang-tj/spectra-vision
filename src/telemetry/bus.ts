import type { Delegate, TaskKind, VisionResult } from "../vision/types";

/** Measured events only: every number here comes from a model run or a clock. */
export type TelemetryEvents = {
  /** One per task result, fed by the vision hook. */
  inference: {
    kind: TaskKind;
    latency: number;
    time: number;
    delegate: Delegate;
  };
  /** One per model load. `delegate` is the one in use, so it differs from
   * `requested` after a GPU to CPU fallback. */
  model: {
    kind: TaskKind;
    requested: Delegate;
    delegate: Delegate;
    loadMs: number;
    /** Why `delegate` is not the one requested (a fallback), else empty. */
    note?: string;
    /** Addresses the worker fetched from this site to load: the runtime, its
     * wasm files and the model. */
    files?: string[];
  };
  /** One per merged vision result, for any mode. Read it through
   * `onVisionResult` (src/vision/result-feed.ts). */
  result: { result: VisionResult; generation: number };
  /** One per drawn stage frame, fed by the render loop. */
  frame: { time: number; dt: number; drawMs: number };
};

export type Bus<Events> = {
  /** Subscribe; returns the unsubscribe function. */
  on<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void,
  ): () => void;
  emit<K extends keyof Events>(type: K, event: Events[K]): void;
  /** Lets a hot path skip building an event nobody will read. */
  listening(type: keyof Events): boolean;
};

export function createBus<Events>(): Bus<Events> {
  const listeners = new Map<keyof Events, Set<(event: never) => void>>();
  return {
    on(type, listener) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    emit(type, event) {
      const set = listeners.get(type);
      if (!set) return;
      for (const listener of set) {
        // A faulty consumer must never break inference or rendering.
        try {
          (listener as (event: unknown) => void)(event);
        } catch (error) {
          console.error("[spectra telemetry] listener failed", error);
        }
      }
    },
    listening: (type) => (listeners.get(type)?.size ?? 0) > 0,
  };
}

/** The app-wide bus. The lab panel subscribes; nothing is sent anywhere. */
export const telemetry = createBus<TelemetryEvents>();
