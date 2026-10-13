/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { consentWords } from "../shell/download-consent";
import type { DownloadAsk } from "../shell/use-download-consent";
import "../styles/coach.css";

/** The card that asks before a large first download on a touch-first device
 * (shell/use-download-consent.ts). It sits in the page flow where the tips
 * card goes, in the same frame, and covers nothing. Until one of its buttons
 * is pressed the mode has not changed and nothing has been fetched. */
export default function DownloadConsent({
  ask,
  onAccept,
  onDecline,
}: {
  ask: DownloadAsk;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const words = consentWords(ask.name, ask.bytes, ask.kept);
  return (
    <div
      className="coach download-ask"
      role="group"
      aria-label="Before a large download"
      data-testid="download-ask"
    >
      <strong>{words.title}</strong>
      <p aria-live="polite">{words.text}</p>
      <div className="coach-actions">
        <button className="button primary compact" onClick={onAccept}>
          {words.accept}
        </button>
        <button className="button compact" onClick={onDecline}>
          {words.decline}
        </button>
      </div>
    </div>
  );
}
