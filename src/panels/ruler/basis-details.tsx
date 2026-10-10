/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { ReactNode } from "react";

/** What a bar is, in one sentence that stays on screen, with the whole basis
 * behind a native disclosure. The basis stays in the page while closed, so
 * the browser's find, a screen reader and the tests can still reach it. */
export default function BasisDetails({
  lead,
  children,
}: {
  /** One plain sentence: what the bar is. */
  lead: ReactNode;
  /** The whole basis: what the bar covers and what it leaves out. */
  children: ReactNode;
}) {
  return (
    <div className="ruler-basis-block">
      <p className="ruler-basis">{lead}</p>
      <details className="ruler-details">
        <summary>What this bar covers</summary>
        {children}
      </details>
    </div>
  );
}
