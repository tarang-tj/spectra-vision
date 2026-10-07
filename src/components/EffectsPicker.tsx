import { useMemo } from "react";
import { effectsFor } from "../effects";
import { useStudio } from "../studio-context";

/** One switch per effect registered for the current mode, in registry order. */
export default function EffectsPicker() {
  const studio = useStudio(),
    modeId = studio.mode.id,
    available = useMemo(() => effectsFor(modeId), [modeId]),
    on = studio.frame.settings.effects;
  return (
    <>
      {available.map((effect) => (
        <div className="switch-row" key={effect.id}>
          <span>{effect.label}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={!!on[effect.id]}
            aria-label={effect.label}
            onClick={() => studio.toggleEffect(effect.id)}
          >
            <span />
          </button>
        </div>
      ))}
    </>
  );
}
