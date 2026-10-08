/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { X } from "lucide-react";
import "../styles/coach.css";

/** The three first-run tips. `target` names the control the tip is about:
 * the shell outlines the element carrying the matching data-coach value. */
export const COACH_STEPS = [
  {
    target: "modes",
    title: "Pick what to see",
    text: "Each mode runs a different vision model. Use the switch at the top, or press a number key.",
  },
  {
    target: "effects",
    title: "Layer effects",
    text: "The tray under the stage turns effects on and off. Press E to open or close it.",
  },
  {
    target: "source",
    title: "Use your own view",
    text: "Start your camera or upload a file. Frames are processed on this device and never uploaded.",
  },
] as const;

/** A small card shown on a first visit: on the stage, or under it in the
 * one-column layout. It is not modal: it takes no focus, blocks no control
 * and can be ignored. The control each tip
 * refers to is outlined with CSS only, so nothing is measured or repositioned. */
export default function CoachMarks({
  step,
  onStep,
  onDone,
}: {
  step: number;
  onStep: (step: number) => void;
  onDone: () => void;
}) {
  const tip = COACH_STEPS[step],
    last = step === COACH_STEPS.length - 1;
  if (!tip) return null;
  return (
    <div className="coach" role="group" aria-label="Getting started tips">
      <p className="coach-count">
        Tip {step + 1} of {COACH_STEPS.length}
      </p>
      <strong>{tip.title}</strong>
      <p aria-live="polite">{tip.text}</p>
      <div className="coach-actions">
        <button
          className="button primary compact"
          onClick={() => (last ? onDone() : onStep(step + 1))}
        >
          {last ? "Got it" : "Next tip"}
        </button>
        {!last && (
          <button className="button compact" onClick={onDone}>
            Skip tips
          </button>
        )}
      </div>
      <button
        className="icon-button coach-close"
        aria-label="Close tips"
        onClick={onDone}
      >
        <X size={18} />
      </button>
    </div>
  );
}
