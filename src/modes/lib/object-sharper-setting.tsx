/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import { useStudio } from "../../studio-context";
import {
  SHARPER_MIN_SCORE,
  onSharperChange,
  setSharper,
  sharperBlocked,
  sharperChosen,
  sharperOffered,
  sharperRefusal,
} from "../../vision/detector/sharper";
import { megabytes } from "../../vision/first-download";
import type { TaskSpec } from "../../vision/types";

/** What is said when Sharper is chosen and something else is running. */
export const sharperFallback = (reason: string) =>
  `Sharper is not running: ${reason}. The standard model is running instead.`;

/** Objects' third model choice, Sharper, with what it costs. Shown only
 * where it can run. Where it was chosen and cannot run, or stopped, one line
 * says so and that the standard model is running. */
export default function ObjectSharperSetting({ spec }: { spec: TaskSpec }) {
  const on = useSyncExternalStore(
      onSharperChange,
      sharperChosen,
      sharperChosen,
    ),
    // Read so the line below follows the runner: a result arrives after
    // every restart.
    task = useStudio().frame.result?.tasks.object,
    offered = sharperOffered(),
    blocked = on ? sharperBlocked(spec.kind, task?.delegate) : null;
  if (!offered && !blocked) return null;
  return (
    <div className="measure-settings">
      {offered && (
        <button
          className="button compact"
          aria-pressed={on}
          onClick={() => setSharper(!on)}
        >
          Sharper (GPU)
        </button>
      )}
      <p data-testid="object-sharper">
        {offered &&
          `A stronger detector that runs on this device's graphics processor through WebGPU. It finds more and gives fewer results a second. Downloads a ${megabytes(spec.sizes?.[spec.sharpModel ?? ""] ?? 0)} model the first time it is on. It shows nothing it scores under ${Math.round(SHARPER_MIN_SCORE * 100)}%, and Finer names are not added while it runs. `}
        {blocked && sharperFallback(blocked)}
        {blocked &&
          blocked === sharperRefusal() &&
          " Switch Sharper off and on to try it again."}
      </p>
    </div>
  );
}
