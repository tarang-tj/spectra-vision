/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { presenceStore } from "./presence-store";
import { THRESHOLD_LIMITS } from "./types";
import type { Thresholds } from "./types";

const FIELDS: { key: keyof Thresholds; label: string }[] = [
  { key: "headAngle", label: "Head angle (degrees)" },
  { key: "handSpeed", label: "Hand speed (shoulder widths a second)" },
  { key: "handStill", label: "Hand still time (ms)" },
  { key: "stillMultiple", label: "Still limit (times the noise floor)" },
];

/** The stated thresholds. Changing one recomputes the figures from the recording. */
export default function ThresholdInputs(props: { values: Thresholds }) {
  return (
    <div className="presence-limits">
      {FIELDS.map(({ key, label }) => (
        <label key={key}>
          {label}
          <input
            type="number"
            inputMode="decimal"
            defaultValue={props.values[key]}
            {...THRESHOLD_LIMITS[key]}
            onChange={(e) => {
              // An empty, partial or out-of-range entry is ignored until it is valid.
              const value = e.currentTarget.valueAsNumber,
                { min, max } = THRESHOLD_LIMITS[key];
              if (Number.isFinite(value) && value >= min && value <= max)
                presenceStore.setThresholds({ [key]: value });
            }}
          />
        </label>
      ))}
    </div>
  );
}
