import { useMemo } from "react";
import { trayEffects } from "../shell/effect-controls";
import { useStudio } from "../studio-context";
import EffectIntensity from "./EffectIntensity";

/** One switch per effect that can draw in the current mode, in registry
 * order. An effect that is on and exposes an intensity gets a slider next to
 * its switch. */
export default function EffectsPicker() {
  const studio = useStudio(),
    mode = studio.mode,
    available = useMemo(() => trayEffects(mode), [mode]),
    on = studio.frame.settings.effects;
  if (!available.length)
    return <p className="tray-empty">No effects for {mode.short} yet.</p>;
  return (
    <>
      {available.map((effect) => (
        <div
          className="effect-chip"
          key={effect.id}
          data-on={!!on[effect.id]}
          data-effect={effect.id}
        >
          <button
            className="effect-switch"
            role="switch"
            aria-checked={!!on[effect.id]}
            aria-label={effect.label}
            onClick={() => studio.toggleEffect(effect.id)}
          >
            <i aria-hidden="true" />
            <span>{effect.label}</span>
          </button>
          {on[effect.id] && <EffectIntensity effect={effect} />}
        </div>
      ))}
    </>
  );
}
