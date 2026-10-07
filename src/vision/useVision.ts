import { useEffect, useRef, useState } from "react";
import { tasksOf } from "../modes";
import type { ModeDef } from "../modes";
import { mergeResults } from "./merge";
import { createTaskRunner } from "./task-runner";
import type { TaskRunner } from "./task-runner";
import type { Source, TaskKind, TaskResult, VisionResult } from "./types";

/** Runs the selected mode's models on the current source. One worker per task,
 * loaded only when the mode is selected and terminated when it changes. */
export function useVision(
  mode: ModeDef,
  source: Source | null,
  paused: boolean,
  confidence: number,
) {
  const [result, setResult] = useState<VisionResult | null>(null),
    [status, setStatus] = useState("Loading model"),
    [error, setError] = useState("");
  const [restart, setRestart] = useState(0),
    settings = useRef({ source, paused, confidence });
  settings.current = { source, paused, confidence };
  useEffect(() => {
    setResult(null);
  }, [source?.generation, mode]);
  useEffect(() => {
    const base = new URL(import.meta.env.BASE_URL, location.href).href,
      specs = tasksOf(mode),
      kinds = specs.map((spec) => spec.kind);
    let stopped = false,
      raf = 0,
      pending = specs.length,
      latest: Partial<Record<TaskKind, TaskResult>> = {};
    setStatus("Loading model");
    setError("");
    setResult(null);
    const unavailable = (message: string) => {
      if (stopped) return;
      clearTimeout(timeout);
      setError(message);
      setStatus("Model unavailable");
    };
    const timeout = setTimeout(() => {
      if (pending > 0) {
        setError("Model load timed out. Check your connection and retry.");
        setStatus("Model unavailable");
      }
    }, 45000);
    const runners: TaskRunner[] = specs.map((spec) =>
      createTaskRunner(spec, base, {
        onReady() {
          if (stopped || --pending > 0) return;
          clearTimeout(timeout);
          setStatus("Ready");
        },
        onResult(taskResult) {
          if (stopped) return;
          // Results for a source that has since been replaced are discarded.
          if (taskResult.generation !== settings.current.source?.generation)
            return;
          const merged = mergeResults(mode.id, kinds, latest, taskResult);
          latest = merged.tasks;
          setResult(merged);
        },
        onError: unavailable,
      }),
    );
    // Hand one frame to a runner that asked for it. Each worker gets its own
    // bitmap because a bitmap is transferred, not shared.
    const feed = async (runner: TaskRunner, generation: number) => {
      const state = settings.current;
      try {
        const bitmap = await createImageBitmap(state.source!.element);
        if (stopped || generation !== settings.current.source?.generation) {
          bitmap.close();
          runner.release();
          return;
        }
        runner.send(bitmap, performance.now(), generation, state.confidence);
      } catch {
        runner.release();
        if (!stopped)
          setError(
            "Could not read this frame. Try another image, video or camera.",
          );
      }
    };
    const tick = (time: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const state = settings.current,
        element = state.source?.element;
      if (state.paused || !element) return;
      if (element instanceof HTMLVideoElement && element.readyState < 2) return;
      for (let i = 0; i < runners.length; i++) {
        const runner = runners[i];
        if (!runner.wants(time)) continue;
        runner.claim(time);
        void feed(runner, state.source!.generation);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
      runners.forEach((runner) => runner.dispose());
    };
  }, [mode, restart]);
  return { result, status, error, retry: () => setRestart((n) => n + 1) };
}
