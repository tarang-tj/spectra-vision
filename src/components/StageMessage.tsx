/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { CameraOff, TriangleAlert } from "lucide-react";

// What went wrong, read from the message the source controller reports. Each
// cause gets its own heading and, where the user can fix it, the next step.
const CAUSES = [
  {
    match: "Camera permission was denied",
    title: "Camera access is blocked.",
    fix: "Open the site settings from the address bar, set Camera to Allow, then retry. You can also carry on without a camera.",
  },
  {
    match: "No camera found",
    title: "No camera found.",
    fix: "",
  },
  {
    match: "Camera is busy",
    title: "The camera is in use.",
    fix: "",
  },
  {
    match: "Camera disconnected",
    title: "The camera went away.",
    fix: "",
  },
] as const;

/** The stage's error state. It replaces the picture, says what happened in
 * plain words and always offers a way forward: retry, or the demo. */
export default function StageMessage({
  error,
  retryLabel,
  onRetry,
  onDemo,
}: {
  error: string;
  retryLabel: string;
  onRetry: () => void;
  onDemo: () => void;
}) {
  const cause = CAUSES.find((c) => error.startsWith(c.match)),
    camera = !!cause || /camera/i.test(error);
  return (
    <div className="stage-message error" role="alert">
      {camera ? <CameraOff size={26} /> : <TriangleAlert size={26} />}
      <strong>{cause?.title ?? "Let’s get you seeing."}</strong>
      <p>{error}</p>
      {cause?.fix && <p className="stage-fix">{cause.fix}</p>}
      <div>
        <button className="button primary compact" onClick={onRetry}>
          {retryLabel}
        </button>
        <button className="button compact" onClick={onDemo}>
          Try demo
        </button>
      </div>
    </div>
  );
}
