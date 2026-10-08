/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";
import { Check, Link, X } from "lucide-react";
import { getMode } from "../modes";
import { copyText, studioLink } from "../shell/share";
import type { ShareResult } from "../shell/share";
import "../styles/share.css";

/** Shown after a recording: the clip that was just saved, with a button that
 * copies the address of SPECTRA. Nothing is uploaded; the clip plays from this
 * tab's memory. */
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
      <video
        src={result.url}
        aria-label="Recorded clip"
        controls
        muted
        loop
        playsInline
      />
      <div className="share-text">
        <strong>{getMode(result.mode).short} clip saved</strong>
        <p>
          {result.seconds} s, saved to your downloads as {result.file}. It never
          left this device.
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
