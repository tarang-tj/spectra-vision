/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import type { EffectDef } from "../effects";
import {
  effectIntensity,
  onEffectIntensity,
  setEffectIntensity,
} from "../effects/lib/intensity";

/** The strength slider of one effect, for effects that declare `intensity`.
 * The value lives in the effects lane's store, which the effect reads every
 * frame, so the slider only writes it and re-renders when it changes. */
export default function EffectIntensity({ effect }: { effect: EffectDef }) {
  const fallback = effect.intensity?.default ?? 0,
    value = useSyncExternalStore(onEffectIntensity, () =>
      effectIntensity(effect.id, fallback),
    );
  if (!effect.intensity) return null;
  return (
    <input
      className="effect-intensity"
      type="range"
      min="0"
      max="1"
      step="0.05"
      aria-label={`${effect.label} intensity`}
      aria-valuetext={`${Math.round(value * 100)}%`}
      title={`${effect.label} intensity: ${Math.round(value * 100)}%`}
      value={value}
      onChange={(event) =>
        setEffectIntensity(effect.id, Number(event.target.value))
      }
      style={{ "--value": `${value * 100}%` } as React.CSSProperties}
    />
  );
}
