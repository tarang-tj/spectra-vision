/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Wires the Ruler to the stage while its panel is mounted: the overlay, the
// pointer handler and the pause. The measurements live in the store, so a
// panel that mounts again draws them again.
import { useCallback, useEffect, useRef } from "react";
import { useStudio } from "../../studio-context";
import { drawRuler, dropSnapshot, view } from "./overlay";
import { endDrag, onRulerPointer } from "./pointer";
import { clear } from "./store";

/** `still` is true when the picture is a photo or the stage is paused. Taps
 * are only listened for then: while the picture moves the canvas must let a
 * finger scroll the page, and the Freeze button (not a tap) freezes it. */
export function useRulerStage(still: boolean) {
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
    // A video moves on once resumed: its points would describe a gone frame.
    if (view.video) clear();
    live.current.setPaused(false);
  }, []);

  // Something else resumed the stage (a mode change, the stage's own button):
  // the pause is no longer ours, so closing the panel must not touch it.
  useEffect(() => {
    if (!paused) froze.current = false;
  }, [paused]);

  useEffect(() => {
    if (!still) return;
    const off = stage.onPointer(onRulerPointer);
    return () => {
      off();
      endDrag();
    };
  }, [stage, still]);

  useEffect(() => {
    const offOverlay = stage.addOverlay(drawRuler);
    return () => {
      offOverlay();
      // Leave the stage as found: resume only what this panel paused.
      if (froze.current && live.current.paused) live.current.setPaused(false);
      froze.current = false;
      // The stage may run again while the panel is closed; video points go.
      if (view.video) clear();
      dropSnapshot();
    };
  }, [stage]);

  return { freeze, resume };
}
