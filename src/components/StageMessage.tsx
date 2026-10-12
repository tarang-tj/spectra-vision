/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { CameraOff, TriangleAlert } from "lucide-react";
import type { StageCard } from "../shell/stage-card";

/** The stage's error state. It replaces the picture, says what happened in
 * plain words and always offers a way forward: retry, or the demo. The words
 * come from stage-card.ts, which knows the cause. */
export default function StageMessage({
  card,
  onRetry,
  onDemo,
}: {
  card: StageCard;
  onRetry: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="stage-message error" role="alert">
      {card.camera ? <CameraOff size={26} /> : <TriangleAlert size={26} />}
      <strong>{card.title}</strong>
      <p>{card.text}</p>
      {card.fix && <p className="stage-fix">{card.fix}</p>}
      <div>
        {card.retry && (
          <button className="button primary compact" onClick={onRetry}>
            {card.retry}
          </button>
        )}
        {card.demo && (
          <button className="button compact" onClick={onDemo}>
            Try demo
          </button>
        )}
      </div>
    </div>
  );
}

/** Shown when a camera request has sat unanswered for a while: the browser
 * is asking, and its prompt is easy to miss. Cancel gives the page back. */
export function StageWaiting({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="stage-message" role="status">
      <strong>Waiting for your answer.</strong>
      <p>
        Your browser is asking to use the camera. Look for its prompt near the
        address bar and choose Allow.
      </p>
      <div>
        <button className="button compact" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
