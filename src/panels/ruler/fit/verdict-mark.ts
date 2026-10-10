/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// How a fit verdict is told apart at a glance: a word, a mark and a colour,
// so nothing rests on colour alone. Shared by the panel and the stage.
import { EDGE, LINE, REF } from "../overlay-parts";
import type { Kind, Row } from "./verdict";

/** A tick, a cross and a tilde, as plain text. */
export const MARK: Record<Kind, string> = { fits: "✓", over: "×", close: "~" };
export const WORD: Record<Kind, string> = {
  fits: "Fits",
  over: "Does not fit",
  close: "Too close to call",
};
/** From the Ruler's own palette: mint, pink, amber. */
export const COLOR: Record<Kind, string> = {
  fits: LINE,
  over: EDGE,
  close: REF,
};

const WORST: Kind[] = ["over", "close", "fits"];

/** The one verdict the stage shows for the box: the worst of them all, since
 * a box that fails one check does not fit. Null with no verdict yet. */
export function headline(rows: readonly Row[]): {
  kind: Kind;
  label: string;
  /** How many verdicts there are in all. */
  of: number;
} | null {
  const all = rows.flatMap((r) =>
    r.verdicts.map((v) => ({ kind: v.kind, label: r.label })),
  );
  for (const kind of WORST) {
    const hit = all.find((v) => v.kind === kind);
    if (hit) return { ...hit, of: all.length };
  }
  return null;
}

/** "✓ Fits", or with several checks "× Does not fit (Area 1)". */
export const tagText = (h: { kind: Kind; label: string; of: number }): string =>
  `${MARK[h.kind]} ${WORD[h.kind]}${h.of > 1 ? ` (${h.label})` : ""}`;
