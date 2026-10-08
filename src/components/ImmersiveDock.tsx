/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { Minimize, Sparkles } from "lucide-react";
import { modes } from "../modes";
import { useStudio } from "../studio-context";
import EffectsPicker from "./EffectsPicker";
import "../styles/immersive.css";

/** The floating controls of the immersive (stage only) view: mode, effects
 * and the way back. The stage keeps its own toolbar for pause, mirror,
 * screenshot and record, so nothing is out of reach. */
export default function ImmersiveDock({
  effectsOpen,
  onEffects,
  onExit,
}: {
  effectsOpen: boolean;
  onEffects: () => void;
  onExit: () => void;
}) {
  const studio = useStudio();
  return (
    <div className="immersive-dock" role="toolbar" aria-label="Immersive view">
      <select
        aria-label="Vision mode"
        value={studio.mode.id}
        onChange={(event) => studio.setMode(event.target.value)}
      >
        {modes.map((mode) => (
          <option value={mode.id} key={mode.id}>
            {mode.short}
          </option>
        ))}
      </select>
      <button
        className="dock-button"
        aria-expanded={effectsOpen}
        aria-controls="immersive-effects"
        onClick={onEffects}
      >
        <Sparkles size={18} />
        <span>Effects</span>
      </button>
      <button className="dock-button" onClick={onExit}>
        <Minimize size={18} />
        <span>Exit</span>
      </button>
      {effectsOpen && (
        <div
          id="immersive-effects"
          className="immersive-effects"
          role="group"
          aria-label="Effects"
        >
          <EffectsPicker />
        </div>
      )}
    </div>
  );
}
