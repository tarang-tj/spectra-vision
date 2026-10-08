/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The benchmark protocol. For each chosen mode and delegate: load the model,
// wait for a first result, let a stated warm-up pass, then record every
// inference and stage frame for a fixed period. Figures come only from the
// telemetry bus and performance.now(). The timers here exist only while a
// benchmark runs, and the mode and delegate choices are put back at the end.
import { tasksOf } from "../../modes";
import type { ModeDef } from "../../modes";
import { telemetry } from "../../telemetry/bus";
import { droppedFrames, rate, summarize } from "../../telemetry/stats";
import { loadCount, taskStatus } from "../../telemetry/task-status";
import { chooseDelegate, chosenDelegate } from "../../vision/delegate";
import type { Delegate, Source, TaskKind } from "../../vision/types";
import { measured } from "./benchmark-report";
import type { BenchRow, BenchTask } from "./benchmark-report";
import { hashModel, modelCard } from "./environment";

export const MEASURE_MS = 20_000;
export const WARMUP_MS = 2_000;
const LOAD_LIMIT_MS = 60_000,
  FIRST_RESULT_LIMIT_MS = 15_000;

export type BenchHost = {
  mode(): ModeDef;
  setMode(id: string): void;
  paused(): boolean;
  source(): Source | null;
};
export type BenchPlan = {
  modes: ModeDef[];
  delegates: Delegate[];
  measureMs: number;
  warmupMs: number;
};
class Stop extends Error {}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Stop("stopped"));
    const done = () => {
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const timer = setTimeout(done, ms),
      stop = () => {
        clearTimeout(timer);
        reject(new Stop("stopped"));
      };
    signal.addEventListener("abort", stop, { once: true });
  });
/** Poll a condition until it holds; false when the limit passes first. */
async function until(test: () => boolean, limit: number, signal: AbortSignal) {
  const started = performance.now();
  while (!test()) {
    if (performance.now() - started > limit) return false;
    await sleep(50, signal);
  }
  return true;
}
const sourceOf = (source: Source | null): BenchRow["source"] => {
  if (!source) return null;
  const e = source.element,
    video = e instanceof HTMLVideoElement;
  return {
    kind: source.kind,
    label: source.label,
    width: video ? e.videoWidth : e.naturalWidth,
    height: video ? e.videoHeight : e.naturalHeight,
  };
};

async function runOne(
  mode: ModeDef,
  delegate: Delegate,
  plan: BenchPlan,
  host: BenchHost,
  signal: AbortSignal,
  say: (text: string) => void,
): Promise<BenchRow> {
  const specs = tasksOf(mode),
    name = `${mode.short} on ${delegate}`,
    row: BenchRow = {
      mode: mode.id,
      modeLabel: mode.short,
      delegateRequested: delegate,
      status: "failed",
      note: "",
      source: null,
      measuredMs: plan.measureMs,
      processedFps: null,
      renderFps: null,
      droppedFrames: null,
      tasks: [],
    },
    latencies = new Map<TaskKind, number[]>(specs.map((s) => [s.kind, []])),
    frames: number[] = [];
  let seen = 0,
    recording = false,
    end = 0,
    hidden = document.hidden;
  const onHide = () => (hidden ||= document.hidden);
  const offInference = telemetry.on("inference", (event) => {
    if (event.kind === specs[0].kind) seen++;
    if (recording && performance.now() <= end)
      latencies.get(event.kind)?.push(event.latency);
  });
  const offFrame = telemetry.on("frame", () => {
    const now = performance.now();
    if (recording && now <= end) frames.push(now);
  });
  document.addEventListener("visibilitychange", onHide);
  const status = () => specs.map((s) => taskStatus(s.kind, s.model));
  try {
    say(`${name}: loading`);
    const before = loadCount(),
      switched = host.mode().id !== mode.id;
    // Choose first, so a newly selected mode loads once, on this delegate.
    specs.forEach((spec) => chooseDelegate(spec.kind, delegate));
    if (switched) host.setMode(mode.id);
    const loaded = await until(
      () =>
        host.mode().id === mode.id &&
        status().every(
          (s) =>
            s &&
            s.requested === delegate &&
            s.state !== "loading" &&
            (!switched || s.load > before),
        ),
      LOAD_LIMIT_MS,
      signal,
    );
    const failed = status().find((s) => s?.state === "failed");
    if (!loaded || failed) {
      row.note = failed
        ? failed.note
        : `Model did not load in ${LOAD_LIMIT_MS / 1000} s`;
      return row;
    }
    seen = 0;
    if (!(await until(() => seen > 0, FIRST_RESULT_LIMIT_MS, signal))) {
      row.note = host.paused()
        ? "No result: the stage is paused"
        : "No result: no frame reached the model";
      return row;
    }
    say(`${name}: warm-up ${plan.warmupMs / 1000} s`);
    await sleep(plan.warmupMs, signal);
    const loads = status().map((s) => s?.load);
    say(`${name}: measuring ${plan.measureMs / 1000} s`);
    hidden = document.hidden;
    end = performance.now() + plan.measureMs;
    recording = true;
    await sleep(plan.measureMs, signal);
    // A timer can fire late; samples after `end` were already left out.
    await until(() => performance.now() >= end, 1000, signal);
    recording = false;

    const final = status(),
      drops = droppedFrames(frames);
    row.source = sourceOf(host.source());
    row.processedFps = measured(
      rate(latencies.get(specs[0].kind)!.length, plan.measureMs),
    );
    row.renderFps = measured(rate(frames.length, plan.measureMs));
    row.droppedFrames = frames.length < 3 ? null : drops.dropped;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i],
        s = summarize(latencies.get(spec.kind)!),
        sha256 = await hashModel(spec.model),
        task: BenchTask = {
          kind: spec.kind,
          model: spec.model,
          sha256,
          sha256Matches: sha256
            ? sha256 === modelCard(spec.model)?.sha256
            : null,
          delegateRequested: delegate,
          delegateActive: final[i]?.active ?? null,
          delegateNote: final[i]?.note ?? "",
          loadMs: final[i]?.loadMs ?? null,
          samples: s.count,
          p50: measured(s.p50),
          p95: measured(s.p95),
          max: measured(s.max),
        };
      row.tasks.push(task);
    }
    const problem = hidden
      ? "The tab was hidden during the run"
      : host.mode().id !== mode.id
        ? "The mode was changed during the run"
        : host.paused()
          ? "The stage was paused during the run"
          : final.some((s, i) => s?.load !== loads[i])
            ? "A model restarted during the run"
            : "";
    row.status = problem ? "invalid" : "ok";
    row.note = problem;
    return row;
  } finally {
    offInference();
    offFrame();
    document.removeEventListener("visibilitychange", onHide);
  }
}

/** Run the whole plan. Resolves with the rows finished so far, also when it
 * is stopped early; the starting mode and delegate choices are restored. */
export async function runBenchmark(
  plan: BenchPlan,
  host: BenchHost,
  signal: AbortSignal,
  say: (text: string) => void,
): Promise<BenchRow[]> {
  const rows: BenchRow[] = [],
    startMode = host.mode().id,
    kinds = new Set(plan.modes.flatMap((m) => tasksOf(m).map((s) => s.kind))),
    choices = [...kinds].map((kind) => [kind, chosenDelegate(kind)] as const);
  try {
    for (const mode of plan.modes)
      for (const delegate of plan.delegates)
        rows.push(await runOne(mode, delegate, plan, host, signal, say));
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  } finally {
    choices.forEach(([kind, choice]) => chooseDelegate(kind, choice));
    if (host.mode().id !== startMode) host.setMode(startMode);
  }
  return rows;
}
