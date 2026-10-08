/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef } from "react";
import { ChevronDown, Gamepad2, Maximize, Sparkles } from "lucide-react";
import { games } from "../games";
import { trayEffects } from "../shell/effect-controls";
import { useStudio } from "../studio-context";
import EffectsPicker from "./EffectsPicker";

/** The strip under the stage: the effects tray on the left, the way into the
 * games and the immersive view on the right. Everything listed comes from the
 * registries, so it grows as plugins are added. */
export default function StudioDeck({
  open,
  focusTray,
  onToggle,
  onImmersive,
}: {
  open: boolean;
  /** Counter bumped when the tray is opened from the keyboard: move focus in. */
  focusTray: number;
  onToggle: () => void;
  onImmersive: () => void;
}) {
  const studio = useStudio(),
    tray = useRef<HTMLDivElement>(null),
    on = studio.frame.settings.effects,
    active = trayEffects(studio.mode).filter((e) => on[e.id]).length;
  useEffect(() => {
    if (focusTray && open)
      tray.current?.querySelector<HTMLElement>("[role=switch]")?.focus();
  }, [focusTray, open]);
  return (
    <section
      className="deck"
      aria-label="Effects and games"
      data-coach="effects"
    >
      <button
        className="deck-toggle"
        aria-expanded={open}
        aria-controls="effects-tray"
        aria-keyshortcuts="E"
        title="Effects tray (E)"
        onClick={onToggle}
      >
        <Sparkles size={18} />
        Effects
        <small>{active} on</small>
        <ChevronDown size={16} className="deck-chevron" />
      </button>
      <div
        id="effects-tray"
        className="effects-tray"
        ref={tray}
        hidden={!open}
        role="group"
        aria-label="Effects"
      >
        {open && <EffectsPicker />}
      </div>
      <div className="deck-actions">
        {games.length > 0 && (
          <button
            className="button compact"
            onClick={() => studio.openPanel("play")}
          >
            <Gamepad2 size={18} />
            {games.length} {games.length === 1 ? "game" : "games"}
          </button>
        )}
        <button className="button compact" onClick={onImmersive}>
          <Maximize size={18} />
          Immersive
        </button>
      </div>
    </section>
  );
}
