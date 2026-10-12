/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import { tasksOf } from "../modes";
import { telemetry } from "../telemetry/bus";
import type { ModeDef } from "../modes";
import { firstDownloadNote } from "./first-download";
import { createFrameHolder } from "./held-frame";
import { mergeResults } from "./merge";
import { createStillGate, setStillState } from "./still";
import "./still-holds";
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
  // State is cleared in an effect, which runs after the render that follows a
  // mode or source change. In that render the stored result still belongs to
  // the previous mode, so it is checked here: nothing that draws or lists ever
  // receives a result made for another mode, task set or source.
  const current =
    result &&
    result.mode === mode.id &&
    result.generation === source?.generation
      ? result
      : null;
  useEffect(() => {
    const base = new URL(import.meta.env.BASE_URL, location.href).href,
      specs = tasksOf(mode),
      kinds = specs.map((spec) => spec.kind);
    let stopped = false,
      raf = 0,
      failed = false,
      timeout: ReturnType<typeof setTimeout> | undefined,
      // What the stage says while the models load.
      loading = "Loading model",
      latest: Partial<Record<TaskKind, TaskResult>> = {};
    setError("");
    setResult(null);
    const unavailable = (message: string) => {
      if (stopped) return;
      failed = true;
      clearTimeout(timeout);
      setError(message);
      setStatus("Model unavailable");
    };
    // The status is read from the runners, so it is "Ready" only while every
    // task of the mode is loaded, including after a runner starts again.
    const loaded = () => runners.every((runner) => runner.ready());
    const report = () => {
      if (stopped || failed) return;
      clearTimeout(timeout);
      if (loaded()) return setStatus("Ready");
      setStatus(loading);
      timeout = setTimeout(() => {
        if (!loaded())
          unavailable("Model load timed out. Check your connection and retry.");
      }, 45000);
    };
    // How often a still picture is inferred (still.ts). Anything that can
    // change the answer wakes it: here a restart or a live option, in the
    // tick a new picture, a new confidence or a resume.
    const gate = createStillGate(specs.map((spec) => spec.still === "once")),
      offs = specs.flatMap((spec) => [
        spec.live?.subscribe(gate.wake),
        // The mode's readout changed without a new result: show it again.
        spec.restate?.(() => {
          if (!stopped) setResult((shown) => (shown ? { ...shown } : shown));
        }),
      ]);
    // For a task that asks, the frame each result was computed from.
    const holders = specs.map((spec) =>
      spec.holdFrame ? createFrameHolder() : null,
    );
    const runners: TaskRunner[] = specs.map((spec, index) =>
      createTaskRunner(spec, base, {
        onReady: report,
        // A delegate switch or a GPU to CPU fallback loads the model again.
        onRestart() {
          holders[index]?.drop();
          gate.wake();
          report();
        },
        onResult(taskResult) {
          if (stopped) return;
          const held = holders[index]?.commit();
          if (held) taskResult.frame = held;
          // Results for a source that has since been replaced are discarded.
          if (taskResult.generation !== settings.current.source?.generation)
            return;
          gate.counted(index);
          const merged = mergeResults(mode.id, kinds, latest, taskResult);
          latest = merged.tasks;
          // The module-level result feed (result-feed.ts), built only while
          // someone listens.
          if (telemetry.listening("result"))
            telemetry.emit("result", {
              result: merged,
              generation: merged.generation,
            });
          setResult(merged);
        },
        onError: unavailable,
      }),
    );
    // Hand one frame to a runner that asked for it. Each worker gets its own
    // bitmap because a bitmap is transferred, not shared.
    const feed = async (index: number, generation: number) => {
      const state = settings.current,
        runner = runners[index];
      try {
        const element = state.source!.element,
          bitmap = await createImageBitmap(element);
        if (stopped || generation !== settings.current.source?.generation) {
          bitmap.close();
          runner.release();
          return;
        }
        const now = performance.now();
        // A still picture never moves on, so there is nothing to hold.
        if (element instanceof HTMLVideoElement)
          holders[index]?.capture(bitmap, now);
        runner.send(bitmap, now, generation, state.confidence);
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
        element = state.source?.element,
        resting = state.paused || !element,
        paced = gate.tick(
          !!element && !(element instanceof HTMLVideoElement),
          state.source?.generation ?? -1,
          state.confidence,
          resting,
        );
      if (resting) return;
      if (element instanceof HTMLVideoElement && element.readyState < 2) return;
      for (let i = 0; i < runners.length; i++) {
        const runner = runners[i];
        if (!runner.wants(time) || (paced && !gate.allows(i, time))) continue;
        runner.claim(time);
        gate.sent(i, time);
        void feed(i, state.source!.generation);
      }
    };
    report();
    // A large model that is not on this device yet: say its size, once.
    void firstDownloadNote(specs, base).then((note) => {
      if (stopped || failed || !note || loaded()) return;
      loading = note;
      setStatus(note);
    });
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
      offs.forEach((off) => off?.());
      setStillState({ state: "live" });
      runners.forEach((runner) => runner.dispose());
    };
  }, [mode, restart]);
  return {
    result: current,
    status,
    error,
    retry: () => setRestart((n) => n + 1),
  };
}
