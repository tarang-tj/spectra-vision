/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which further references and known spans can go into the fused solve, and
// a plain reason for each one that cannot. Pure: points in, a sheet out.
import type { FuseInput } from "./fused";
import { fuseOnce, makeFused } from "./fused-trials";
import {
  applyHomography,
  degenerateReason,
  orderCorners,
  type Pt,
  type Sheet,
} from "./homography";
import { applyLens, type Lens } from "./lens";

export type ExtraRect = { corners: Pt[]; long: number; short: number };
export type KnownSpan = { a: Pt; b: Pt; mm: number | null };
/** `used` false with a null `why` means it is simply not finished yet. */
export type Used = { used: boolean; why: string | null };
export type Fusion = {
  /** The first reference's sheet, with `h` and `fused` replaced when anything
   * further was usable; otherwise the same object that came in. */
  sheet: Sheet;
  rects: Used[];
  spans: Used[];
  /** A problem with the fused solve as a whole, or null. */
  note: string | null;
};

/** The residual (root mean square per spare constraint) that tap and tape
 * error alone would exceed about once in a thousand solves: the 99.9% point
 * of chi-squared over its degrees of freedom (Wilson-Hilferty). Above it the
 * known sizes disagree with each other. */
export function chiLimit(spare: number): number {
  const k = 2 / (9 * spare);
  return Math.sqrt((1 - k + 3.09 * Math.sqrt(k)) ** 3);
}

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const inside = (q: Pt[], p: Pt) => {
  const signs = q.map((a, i) => Math.sign(cross(a, q[(i + 1) % 4], p)));
  return signs.every((v) => v >= 0) || signs.every((v) => v <= 0);
};
/** Do two convex four-sided shapes share any of the picture? */
export function quadsOverlap(a: Pt[], b: Pt[]): boolean {
  if (a.some((p) => inside(b, p)) || b.some((p) => inside(a, p))) return true;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const p1 = a[i],
        p2 = a[(i + 1) % 4],
        p3 = b[j],
        p4 = b[(j + 1) % 4];
      if (
        cross(p3, p4, p1) * cross(p3, p4, p2) < 0 &&
        cross(p1, p2, p3) * cross(p1, p2, p4) < 0
      )
        return true;
    }
  return false;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Fuse what can be fused. `sheet` is the first reference's own solve (with
 * `raw` taps); points in `rects` and `spans` are as tapped. */
export function fuseSheet(
  sheet: Sheet,
  lens: Lens | null,
  rects: ExtraRect[],
  spans: KnownSpan[],
  sigmaPx: number,
  tapeSigmaMm: number,
): Fusion {
  const flat = (p: Pt) => applyLens(lens, p),
    taken: Pt[][] = [sheet.ordered],
    goodRects: { taps: Pt[]; plane: Pt[] }[] = [],
    goodSpans: { a: Pt; b: Pt; mm: number }[] = [];
  const rectUse = rects.map((r): Used => {
    if (r.corners.length < 4) return { used: false, why: null };
    const raw = orderCorners(r.corners),
      at = raw.map(flat),
      bad = degenerateReason(at);
    if (bad) return { used: false, why: `${bad}.` };
    if (taken.some((q) => quadsOverlap(q, at)))
      return {
        used: false,
        why: "it overlaps another reference. Each reference must be a separate object.",
      };
    const on = at.map((p) => applyHomography(sheet.h, p));
    if (on.some((p) => !p))
      return {
        used: false,
        why: "a corner is at or beyond the horizon of the surface.",
      };
    const q = on as Pt[],
      // Which side is the long one, judged on the surface, not in the picture.
      firstIsLong =
        dist(q[0], q[1]) + dist(q[3], q[2]) >=
        dist(q[1], q[2]) + dist(q[0], q[3]),
      w = firstIsLong ? r.long : r.short,
      d = firstIsLong ? r.short : r.long;
    taken.push(at);
    goodRects.push({
      taps: raw,
      plane: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
      ],
    });
    return { used: true, why: null };
  });
  const spanUse = spans.map((s): Used => {
    if (s.mm === null || !Number.isFinite(s.mm) || !(s.mm > 0))
      return {
        used: false,
        why: "type its length as a number greater than zero.",
      };
    const a = flat(s.a),
      b = flat(s.b);
    if (dist(a, b) < 2)
      return { used: false, why: "its two ends are the same point." };
    if (!applyHomography(sheet.h, a) || !applyHomography(sheet.h, b))
      return {
        used: false,
        why: "a point is at or beyond the horizon of the surface.",
      };
    goodSpans.push({ a: s.a, b: s.b, mm: s.mm });
    return { used: true, why: null };
  });
  if (!goodRects.length && !goodSpans.length)
    return { sheet, rects: rectUse, spans: spanUse, note: null };
  const raw: FuseInput = {
    first: { taps: sheet.raw ?? sheet.ordered, plane: sheet.plane },
    rects: goodRects,
    spans: goodSpans,
    sigmaPx,
    tapeSigmaMm,
  };
  // Which side of a further rectangle is the long one was judged through the
  // first reference alone, which can be wrong far from it. Solve with each
  // rectangle turned the other way too, and keep the way that fits better.
  raw.rects.forEach((r, i) => {
    const [, b, c] = r.plane;
    if (b.x === c.y) return;
    const turned = r.plane.map((p) => ({
        x: p.x ? c.y : 0,
        y: p.y ? b.x : 0,
      })),
      other = { ...raw, rects: raw.rects.slice() };
    other.rects[i] = { ...r, plane: turned };
    const as = fuseOnce(raw, lens),
      alt = fuseOnce(other, lens);
    if (alt && (!as || alt.chi < as.chi)) raw.rects[i] = other.rects[i];
  });
  const fused = makeFused(raw, lens);
  if (!fused) {
    const why = "the known sizes could not be fused into one surface.",
      drop = (u: Used): Used => (u.used ? { used: false, why } : u);
    return {
      sheet,
      rects: rectUse.map(drop),
      spans: spanUse.map(drop),
      note: "The known sizes could not be fused into one surface, so the first reference alone is used. Check each size, and that everything lies on the same surface.",
    };
  }
  return {
    sheet: { ...sheet, h: fused.h, fused },
    rects: rectUse,
    spans: spanUse,
    note:
      fused.spare > 0 && fused.chi > chiLimit(fused.spare)
        ? `The known sizes disagree by ${fused.chi.toFixed(1)} times what tap error explains. Check each size and typed length, and that everything lies on the same surface. The bars do not cover this disagreement.`
        : null,
  };
}
