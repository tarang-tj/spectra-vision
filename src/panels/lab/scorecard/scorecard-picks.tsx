/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { SHARPER_MODEL } from "../../../vision/detector/sharper";
import type { Delegate } from "../../../vision/types";
import * as words from "./score-wording";
import { MODELS } from "./score-worker";

const toggle = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((i) => i !== item) : [...list, item];

/** The scorecard's two sets of tick boxes: which models, and on what. */
export default function ScorecardPicks(props: {
  models: string[];
  setModels(models: string[]): void;
  delegates: Delegate[];
  setDelegates(delegates: Delegate[]): void;
  /** Whether Sharper is offered on this device. */
  sharp: boolean;
  /** Why the GPU cannot be used here, or null. */
  noGpu: string | null;
  running: boolean;
  bytesOf(file: string): number | null;
}) {
  const { models, setModels, delegates, setDelegates } = props,
    { sharp, noGpu, running, bytesOf } = props;
  return (
    <>
      <fieldset className="lab-picks" disabled={running}>
        <legend>Models</legend>
        {MODELS.map(({ file, label }) => {
          const sharper = file === SHARPER_MODEL,
            size = bytesOf(file);
          return (
            <label key={file}>
              <input
                type="checkbox"
                disabled={sharper && !sharp}
                checked={models.includes(file)}
                onChange={() => setModels(toggle(models, file))}
              />
              {label}
              {size ? ` (${words.megabytes(size)} MB` : " ("}
              {sharper
                ? `${size ? ", " : ""}GPU only)`
                : size
                  ? ")"
                  : "size not listed)"}
              {sharper && !sharp
                ? " Sharper is not offered on this device."
                : ""}
            </label>
          );
        })}
      </fieldset>
      <fieldset className="lab-picks" disabled={running}>
        <legend>Run on</legend>
        {(["CPU", "GPU"] as Delegate[]).map((delegate) => (
          <label key={delegate}>
            <input
              type="checkbox"
              disabled={delegate === "GPU" && !!noGpu}
              checked={delegates.includes(delegate)}
              onChange={() => setDelegates(toggle(delegates, delegate))}
            />
            {delegate}
            {delegate === "GPU" && noGpu ? ` GPU not available: ${noGpu}` : ""}
          </label>
        ))}
      </fieldset>
    </>
  );
}
