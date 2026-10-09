/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { tasksOf } from "../modes";
import type { ModeDef } from "../modes";
import { usePrecision, useSmoothing } from "../vision/settings";
import type { Precision } from "../vision/settings";
import "../styles/measure-settings.css";

const LANDMARKS = new Set(["pose", "hand", "face", "gesture"]);
const LEVELS: { id: Precision; label: string }[] = [
  { id: "fast", label: "Fast" },
  { id: "precise", label: "Precise" },
];

/** Smoothing for modes that draw landmarks and Precision for modes whose
 * model has a larger variant, each shown only where it has something to act on. Both are remembered on this
 * device (vision/settings.ts). */
export default function MeasureSettings({ mode }: { mode: ModeDef }) {
  const [smooth, setSmooth] = useSmoothing(),
    [precision, setPrecision] = usePrecision(),
    specs = tasksOf(mode),
    landmarks = specs.some((spec) => LANDMARKS.has(spec.kind)),
    precise = specs.some((spec) => spec.preciseModel);
  if (!landmarks && !precise) return null;
  return (
    <div className="measure-settings">
      {landmarks && (
        <>
          <button
            className="button compact"
            aria-pressed={smooth}
            onClick={() => setSmooth(!smooth)}
          >
            Smooth landmarks
          </button>
          <p>
            Filters what is drawn. Exports and measurements keep the raw values.
          </p>
        </>
      )}
      {precise && (
        <>
          <div role="group" aria-label="Model precision">
            {LEVELS.map((level) => (
              <button
                key={level.id}
                className="button compact"
                aria-pressed={precision === level.id}
                onClick={() => setPrecision(level.id)}
              >
                {level.label}
              </button>
            ))}
          </div>
          <p>
            Fast runs the smaller model. Precise loads a larger one on first
            use, which is slower.
          </p>
        </>
      )}
    </div>
  );
}
