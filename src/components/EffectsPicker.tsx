import { useMemo } from "react";
import { effectsFor } from "../effects";
import { useStudio } from "../studio-context";
import { webgl2Missing } from "../vision/webgl-probe";
import EffectIntensity from "./EffectIntensity";

/** One switch per effect registered for the current mode, in registry order.
 * An effect that is on and exposes an intensity gets a slider next to its
 * switch. Without WebGL2 the GPU effects stay listed, disabled, with the
 * reason beside them. */
export default function EffectsPicker() {
  const studio = useStudio(),
    mode = studio.mode,
    available = useMemo(() => effectsFor(mode.id), [mode]),
    on = studio.frame.settings.effects,
    // Asked only when the mode has a GPU effect to offer.
    noGl = available.some((effect) => effect.kind === "gl") && webgl2Missing();
  if (!available.length)
    return <p className="tray-empty">No effects for {mode.short} yet.</p>;
  return (
    <>
      {available.map((effect) => {
        const blocked = noGl && effect.kind === "gl",
          active = !!on[effect.id] && !blocked;
        return (
          <div
            className="effect-chip"
            key={effect.id}
            data-on={active}
            data-effect={effect.id}
          >
            <button
              className="effect-switch"
              role="switch"
              aria-checked={active}
              aria-label={effect.label}
              disabled={blocked}
              title={blocked ? "Needs WebGL2" : undefined}
              onClick={() => studio.toggleEffect(effect.id)}
            >
              <i aria-hidden="true" />
              <span>{effect.label}</span>
            </button>
            {active && <EffectIntensity effect={effect} />}
          </div>
        );
      })}
      {noGl && (
        <p className="tray-note" role="note">
          GPU effects need WebGL2, which this browser does not provide.
        </p>
      )}
    </>
  );
}
