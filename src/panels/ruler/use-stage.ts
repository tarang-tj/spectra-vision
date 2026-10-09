/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Wires the Ruler to the stage while its panel is mounted: the overlay, the
// pointer handler and the pause. The measurements live in the store, so a
// panel that mounts again draws them again.
import { useCallback, useEffect, useRef } from "react";
import { useStudio } from "../../studio-context";
import { drawRuler } from "./overlay";
import { endDrag, onRulerPointer, setFreeze } from "./pointer";

export function useRulerStage() {
  const { stage, paused, setPaused } = useStudio(),
    live = useRef({ paused, setPaused }),
    // True only when this panel is what paused the stage.
    froze = useRef(false);
  live.current = { paused, setPaused };

  const freeze = useCallback(() => {
    if (live.current.paused) return;
    froze.current = true;
    live.current.setPaused(true);
  }, []);
  const resume = useCallback(() => {
    froze.current = false;
    live.current.setPaused(false);
  }, []);

  useEffect(() => {
    const offOverlay = stage.addOverlay(drawRuler),
      offPointer = stage.onPointer(onRulerPointer);
    setFreeze(freeze);
    return () => {
      offOverlay();
      offPointer();
      setFreeze(null);
      endDrag();
      // Leave the stage as found: resume only what this panel paused.
      if (froze.current && live.current.paused) live.current.setPaused(false);
      froze.current = false;
    };
  }, [stage, freeze]);

  return { freeze, resume };
}
