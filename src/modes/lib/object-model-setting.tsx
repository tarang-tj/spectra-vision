/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import { useStudio } from "../../studio-context";
import { megabytes } from "../../vision/first-download";
import {
  gpuModelRefusal,
  largerOnGpu,
  onModelChoice,
  setLargerOnGpu,
} from "../../vision/model-choice";
import type { TaskSpec } from "../../vision/types";

/** The switch for Objects' larger model on a GPU, with what it does, what is
 * running now and, when the larger model was given up here, why. */
export default function ObjectModelSetting({ spec }: { spec: TaskSpec }) {
  const on = useSyncExternalStore(onModelChoice, largerOnGpu, largerOnGpu),
    task = useStudio().frame.result?.tasks.object,
    size = (file: string | undefined) =>
      megabytes(spec.sizes?.[file ?? ""] ?? 0),
    refusal = gpuModelRefusal(spec.kind);
  return (
    <div className="measure-settings">
      <button
        className="button compact"
        aria-pressed={on}
        onClick={() => setLargerOnGpu(!on)}
      >
        Larger model on a GPU
      </button>
      <p data-testid="object-model">
        On Fast, Objects uses the {size(spec.gpuModel)} model where it runs on a
        real graphics processor and the {size(spec.model)} one on CPU. The
        larger one finds smaller and farther things for a few milliseconds more
        per frame. Switch this off to keep the {size(spec.model)} model on a GPU
        as well.
        {task?.model &&
          ` Running now: the ${size(task.model)} model on ${task.delegate}.`}
        {on &&
          refusal &&
          ` The larger model was given up on this page: ${refusal}. Switch this off and on to try it again.`}
      </p>
    </div>
  );
}
