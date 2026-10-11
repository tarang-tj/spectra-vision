/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";

/** A button for something that cannot be taken back. The first press only
 * arms it: its words change to say what a second press will discard. A press
 * anywhere else, Escape, or focus leaving it puts it back. No dialog and no
 * timer: it stays armed for as long as it is the thing being looked at. */
export default function ConfirmButton({
  label,
  again,
  name,
  disabled,
  onConfirm,
}: {
  /** What it says at rest. */
  label: string;
  /** What it says once armed: the press that will do it, and what is lost. */
  again: string;
  /** Its accessible name at rest, which already says what will be lost. */
  name: string;
  disabled?: boolean;
  onConfirm(): void;
}) {
  const [armed, setArmed] = useState(false),
    button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const elsewhere = (e: Event) => {
        if (!button.current?.contains(e.target as Node)) setArmed(false);
      },
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setArmed(false);
      };
    // Some browsers do not focus a pressed button, so blur alone is not
    // enough to notice a press on something else.
    document.addEventListener("pointerdown", elsewhere, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", elsewhere, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [armed]);
  return (
    <button
      ref={button}
      className="button room-confirm"
      data-armed={armed || undefined}
      aria-label={armed ? again : name}
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        setArmed(!armed);
        if (armed) onConfirm();
      }}
    >
      {armed ? again : label}
    </button>
  );
}
