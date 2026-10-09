/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeEach } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import type { Pt } from "../src/panels/ruler/homography";
import {
  applyLens,
  fitRadial,
  invertLens,
  lensFor,
  straightness,
} from "../src/panels/ruler/lens";
import {
  bindSource,
  finishShape,
  place,
  resetRuler,
  getState,
  setLensOn,
  setTool,
} from "../src/panels/ruler/store";

const W = 1200,
  H = 900;

/** Straight lines in the ideal picture, bent by a lens with coefficient `k`
 * (the picture a camera with that lens would take). */
function bent(k: number): Pt[][] {
  const lens = lensFor(k, W, H),
    line = (a: Pt, b: Pt, n = 7): Pt[] =>
      Array.from({ length: n }, (_, i) => ({
        x: a.x + ((b.x - a.x) * i) / (n - 1),
        y: a.y + ((b.y - a.y) * i) / (n - 1),
      }));
  return [
    line({ x: 80, y: 120 }, { x: 1120, y: 140 }),
    line({ x: 70, y: 760 }, { x: 1130, y: 780 }),
    line({ x: 160, y: 60 }, { x: 140, y: 840 }),
    line({ x: 1050, y: 50 }, { x: 1070, y: 850 }),
  ].map((l) => l.map((p) => invertLens(lens, p)));
}

describe("lens inversion", () => {
  const W = 1920,
    H = 1080;
  it("returns every tapped point of the picture to a millionth of a pixel", () => {
    for (const k of [-0.29, -0.1, 0.05, 0.3, 0.59]) {
      const lens = lensFor(k, W, H);
      let worst = 0;
      for (let x = 0; x <= W; x += 96)
        for (let y = 0; y <= H; y += 90) {
          const p = { x, y },
            back = invertLens(lens, applyLens(lens, p));
          worst = Math.max(worst, Math.hypot(back.x - p.x, back.y - p.y));
        }
      expect(worst, `k=${k}`).toBeLessThan(1e-6);
    }
  });
  it("says there is no tapped point for a position outside the corrected picture", () => {
    // Strong barrel correction pulls the corners in: the frame's own corner is
    // then outside what any tap can reach.
    const lens = lensFor(-0.29, W, H),
      none = invertLens(lens, { x: 0, y: 0 });
    expect(Number.isFinite(none.x) || Number.isFinite(none.y)).toBe(false);
    expect(none.x).toBeLessThan(0);
  });
});

describe("radial lens fit", () => {
  it("moves a point out and back", () => {
    const lens = lensFor(0.2, W, H),
      p = { x: 1000, y: 100 },
      back = invertLens(lens, applyLens(lens, p));
    expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(1e-6);
    expect(applyLens(null, p)).toBe(p);
  });
  it.each([0.15, -0.1, 0.05])(
    "recovers a known coefficient %s from bent straight lines",
    (k) => {
      const edges = bent(k),
        fit = fitRadial(edges, W, H, 0.1)!;
      expect(Math.abs(fit.k - k)).toBeLessThan(1e-3);
      expect(fit.reason).toBeNull();
      expect(fit.improved).toBe(true);
      expect(fit.before).toBeGreaterThan(1);
      expect(fit.after).toBeLessThan(0.01);
      expect(fit.after).toBeLessThan(fit.before * 0.1);
    },
  );
  it("needs two edges of four points each", () => {
    expect(fitRadial([bent(0.1)[0]], W, H)).toBeNull();
    const short = fitRadial(
      [
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
        bent(0.1)[0],
      ],
      W,
      H,
    )!;
    expect(short.improved).toBe(false);
    expect(short.reason).toMatch(/at least 4 points/);
  });
  it("does not call straight edges an improvement", () => {
    const fit = fitRadial(bent(0), W, H, 0.1)!;
    expect(fit.before).toBeLessThan(1e-4);
    expect(fit.improved).toBe(false);
  });
  it("does not accept a fit that cannot be a lens effect", () => {
    // Zig-zag edges: no single radial term straightens them.
    const zig = (y: number): Pt[] =>
      [0, 1, 2, 3, 4].map((i) => ({ x: 100 + i * 250, y: y + (i % 2) * 60 }));
    const fit = fitRadial([zig(200), zig(600)], W, H, 0.1)!;
    expect(fit.after).toBeLessThanOrEqual(fit.before + 1e-9);
    expect(fit.improved).toBe(false);
  });
  it("does not reward a correction that only shrinks the picture", () => {
    const edges = bent(0.2);
    // A strong shrink would shrink every residual if scale were not removed.
    expect(straightness(edges, -0.6, W, H)).toBeGreaterThan(
      straightness(edges, 0.2, W, H),
    );
  });
});

describe("lens correction in the Ruler", () => {
  beforeEach(() => {
    resetRuler();
    bindSource(1, W, H, 1);
  });
  const tapEdges = (edges: Pt[][]) => {
    setTool("edge");
    for (const e of edges) {
      e.forEach((p) => place(p));
      finishShape();
    }
    setTool("span");
  };
  it("applies only when asked for and only when it improves", () => {
    tapEdges(bent(0.15));
    expect(getState().shapes.filter((s) => s.kind === "edge")).toHaveLength(4);
    let d = derive(getState());
    expect(d.lensFit?.improved).toBe(true);
    expect(d.lens).toBeNull(); // off by default
    setLensOn(true);
    d = derive(getState());
    expect(d.lens?.k).toBeCloseTo(0.15, 2);
    expect(d.basis).toMatch(/one-parameter lens correction/);
    expect(d.basis).toMatch(/remaining lens distortion/);
  });
  it("keeps the fixed wording without it, and never applies a worsening fit", () => {
    setLensOn(true);
    const d0 = derive(getState());
    expect(d0.basis).toBe(
      "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.",
    );
    tapEdges(bent(0)); // already straight: nothing to improve
    const d = derive(getState());
    expect(d.lensFit?.improved).toBe(false);
    expect(d.lens).toBeNull();
    expect(d.basis).toBe(d0.basis);
  });
});

describe("lens correction changes a measurement toward the truth", () => {
  it("measures a span closer to its real length once the correction is on", () => {
    resetRuler();
    bindSource(1, W, H, 1);
    // A flat floor seen through a lens with k = 0.2: every tap is bent.
    const MAP = [0.9, 0.05, 150, 0.03, 0.9, 120, 0.00005, 0.0006, 1],
      k = 0.2,
      lens = lensFor(k, W, H),
      toImg = (x: number, y: number): Pt => {
        const w = MAP[6] * x + MAP[7] * y + MAP[8];
        return invertLens(lens, {
          x: (MAP[0] * x + MAP[1] * y + MAP[2]) / w,
          y: (MAP[3] * x + MAP[4] * y + MAP[5]) / w,
        });
      };
    [
      toImg(0, 0),
      toImg(279.4, 0),
      toImg(279.4, 215.9),
      toImg(0, 215.9),
    ].forEach((p) => place(p));
    place(toImg(100, 200));
    place(toImg(1100, 900));
    const truth = Math.hypot(1000, 700),
      off = derive(getState()).rows[0].span!.mm;
    setTool("edge");
    for (const e of bent(k)) {
      e.forEach((p) => place(p));
      finishShape();
    }
    setTool("span");
    setLensOn(true);
    const on = derive(getState());
    expect(on.lens).not.toBeNull();
    const fixed = on.rows[0].span!.mm;
    expect(Math.abs(fixed - truth)).toBeLessThan(Math.abs(off - truth));
    expect(Math.abs(fixed - truth) / truth).toBeLessThan(0.01);
  });
});
