/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";
import { Check, Link, X } from "lucide-react";
import { getGame } from "../games";
import { getMode } from "../modes";
import { copyText, studioLink } from "../shell/share";
import type { ShareResult } from "../shell/share";
import "../styles/share.css";

/** Shown after a recording or when a game stops: the clip that was just saved
 * or the score the game reported, with a button that copies the address of
 * SPECTRA. Nothing is uploaded; the clip plays from this tab's memory. */
export default function ShareCard({
  result,
  onDismiss,
  notice,
}: {
  result: ShareResult;
  onDismiss: () => void;
  notice: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false),
    link = studioLink(location.origin, import.meta.env.BASE_URL);
  const copy = async () => {
    const ok = await copyText(link);
    setCopied(ok);
    notice(ok ? "Link copied." : `Copy this link: ${link}`);
  };
  return (
    <section className="share-card" aria-label="Your result">
      {result.kind === "clip" ? (
        <video
          src={result.url}
          aria-label="Recorded clip"
          controls
          muted
          loop
          playsInline
        />
      ) : (
        <p className="share-score" data-testid="share-score">
          {result.score}
        </p>
      )}
      <div className="share-text">
        <strong>
          {result.kind === "clip"
            ? `${getMode(result.mode).short} clip saved`
            : `${getGame(result.game)?.label ?? "Game"} score`}
        </strong>
        <p>
          {result.kind === "clip"
            ? `${result.seconds} s, saved to your downloads as ${result.file}. It never left this device.`
            : `${result.status}. Scored from your tracked motion on this device.`}
        </p>
      </div>
      <div className="share-actions">
        <button className="button compact" onClick={() => void copy()}>
          {copied ? <Check size={18} /> : <Link size={18} />}
          Copy link to SPECTRA
        </button>
        <button
          className="icon-button"
          aria-label="Dismiss result"
          onClick={onDismiss}
        >
          <X size={20} />
        </button>
      </div>
    </section>
  );
}
