/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef } from "react";
import { ChevronDown, Maximize, Sparkles } from "lucide-react";
import { effectsFor } from "../effects";
import { useStudio } from "../studio-context";
import EffectsPicker from "./EffectsPicker";

/** The strip under the stage: the effects tray on the left, the way into the
 * immersive view on the right. Every effect listed comes from the registry, so
 * the tray grows as plugins are added. */
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
    active = effectsFor(studio.mode.id).filter((e) => on[e.id]).length;
  useEffect(() => {
    if (focusTray && open)
      tray.current?.querySelector<HTMLElement>("[role=switch]")?.focus();
  }, [focusTray, open]);
  return (
    <section
      className="deck"
      aria-label="Effects and immersive view"
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
        <button className="button compact" onClick={onImmersive}>
          <Maximize size={18} />
          Immersive
        </button>
      </div>
    </section>
  );
}
