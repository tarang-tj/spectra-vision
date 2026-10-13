/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import {
  RESAMPLES,
  SEED,
  drawWeights,
  figureOf,
  intervalOf,
  pairedDifference,
  wilson,
} from "../src/panels/lab/scorecard/bootstrap";
import { seededRandom } from "../src/panels/ruler/monte-carlo";

/** Pictures with `hits[i]` of `labels[i]` objects found, as a weighted recall. */
const recall =
  (hits: number[], labels: number[]) =>
  (weights?: ArrayLike<number>): number | null => {
    let h = 0,
      n = 0;
    for (let i = 0; i < hits.length; i++) {
      const w = weights ? weights[i] : 1;
      h += hits[i] * w;
      n += labels[i] * w;
    }
    return n ? h / n : null;
  };
/** A made-up set: each picture has 1 to 8 objects and its own difficulty. */
function pictures(count: number, seed: number) {
  const random = seededRandom(seed),
    labels: number[] = [],
    hits: number[] = [];
  for (let i = 0; i < count; i++) {
    const n = 1 + Math.floor(random() * 8),
      ease = random();
    let h = 0;
    for (let k = 0; k < n; k++) if (random() < ease) h++;
    labels.push(n);
    hits.push(h);
  }
  return { hits, labels };
}

describe("drawWeights", () => {
  it("draws 2,000 resamples of whole pictures, each the size of the set", () => {
    const weights = drawWeights(100);
    expect(RESAMPLES).toBe(2000);
    expect(SEED).toBe(20261012);
    expect(weights).toHaveLength(2000);
    for (const draw of weights) {
      expect(draw).toHaveLength(100);
      expect(draw.reduce((sum, w) => sum + w, 0)).toBe(100);
    }
    // Not the identity: some picture is left out of the first draw.
    expect([...weights[0]].some((w) => w === 0)).toBe(true);
  });
  it("gives the same draws for the same seed and others for another", () => {
    expect(drawWeights(40, 50)).toEqual(drawWeights(40, 50));
    expect(drawWeights(40, 50, 1)).not.toEqual(drawWeights(40, 50, 2));
  });
});

describe("figureOf", () => {
  const set = pictures(100, 7),
    weights = drawWeights(100);
  it("gives the same interval every time for the same run", () => {
    const first = figureOf(recall(set.hits, set.labels), weights),
      again = figureOf(recall(set.hits, set.labels), drawWeights(100));
    expect(first).toEqual(again);
    expect(first.basis).toBe("bootstrap");
    expect(first.lo!).toBeLessThan(first.value!);
    expect(first.hi!).toBeGreaterThan(first.value!);
    expect(first.value).toBe(recall(set.hits, set.labels)());
  });
  it("narrows by about 1 / sqrt(2) when the set doubles", () => {
    const half = pictures(100, 11),
      whole = pictures(200, 11); // the same first 100, then 100 more
    const narrow = figureOf(recall(whole.hits, whole.labels), drawWeights(200)),
      wide = figureOf(recall(half.hits, half.labels), drawWeights(100)),
      ratio = (narrow.hi! - narrow.lo!) / (wide.hi! - wide.lo!);
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
  });
  it("falls back to Wilson over the object count when every resample agrees", () => {
    // 100 identical pictures, each with its one object found.
    const ones = new Array<number>(100).fill(1),
      figure = figureOf(recall(ones, ones), weights, {
        successes: 100,
        total: 100,
      });
    expect(figure.value).toBe(1);
    expect(figure.basis).toBe("wilson");
    expect(figure.lo).toBeCloseTo(wilson(100, 100).lo, 12);
    expect(figure.lo!).toBeLessThan(1);
    expect(figure.hi).toBe(1);
    expect(figure.over).toBe(100);
    // With no count to work it from, no interval is stated at all.
    const bare = figureOf(recall(ones, ones), weights);
    expect([bare.basis, bare.lo, bare.hi]).toEqual(["none", null, null]);
  });
  it("leaves out the resamples with no value, counts them, and states no interval past 5%", () => {
    // Only the first picture has any object, so a draw without it has no
    // recall. With 2 pictures that is a quarter of the draws.
    const few = figureOf(recall([1, 0], [1, 0]), drawWeights(2));
    expect(few.skipped).toBeGreaterThan(RESAMPLES * 0.05);
    expect([few.basis, few.lo, few.hi]).toEqual(["none", null, null]);
    // With 100 pictures and one empty, no draw lacks a value.
    const empty = [...set.labels];
    empty[0] = 0;
    const many = figureOf(
      recall(
        set.hits.map((h, i) => (i ? h : 0)),
        empty,
      ),
      weights,
    );
    expect(many.skipped).toBe(0);
    expect(many.basis).toBe("bootstrap");
  });
  it("has no value and no interval when the figure itself is undefined", () => {
    const figure = figureOf(() => null, weights);
    expect(figure).toMatchObject({
      value: null,
      lo: null,
      hi: null,
      basis: "none",
    });
  });
});

describe("pairedDifference", () => {
  const a = pictures(100, 3),
    b = pictures(100, 4),
    weights = drawWeights(100);
  it("is exactly 0 (0 to 0) for a run against itself", () => {
    const same = pairedDifference(
      recall(a.hits, a.labels),
      recall(a.hits, a.labels),
      weights,
    );
    expect([same.value, same.lo, same.hi]).toEqual([0, 0, 0]);
    // An interval that holds 0 never names a winner.
    expect(same.verdict).toBe("cannot tell");
  });
  it("takes the difference inside each resample, with the same pictures for both", () => {
    // b finds one more object than a in every picture that has room. Paired,
    // the difference is positive in every resample; unpaired intervals this
    // wide would overlap.
    const more = a.hits.map((h, i) => Math.min(a.labels[i], h + 1)),
      figure = pairedDifference(
        recall(more, a.labels),
        recall(a.hits, a.labels),
        weights,
      );
    expect(figure.lo!).toBeGreaterThan(0);
    expect(figure.verdict).toBe("more");
    const reverse = pairedDifference(
      recall(a.hits, a.labels),
      recall(more, a.labels),
      weights,
    );
    expect(reverse.verdict).toBe("fewer");
    expect(reverse.hi).toBeCloseTo(-figure.lo!, 12);
  });
  it("says it cannot tell two runs apart when the interval contains 0", () => {
    const figure = pairedDifference(
      recall(a.hits, a.labels),
      recall(
        b.hits,
        a.labels.map((n, i) => Math.max(n, b.hits[i])),
      ),
      weights,
    );
    expect(figure.lo!).toBeLessThan(0);
    expect(figure.hi!).toBeGreaterThan(0);
    expect(figure.verdict).toBe("cannot tell");
  });
});

describe("intervalOf", () => {
  it("is the 2.5th and 97.5th percentiles", () => {
    const values = Array.from({ length: 1001 }, (_, i) => i / 1000);
    expect(intervalOf(values)).toEqual({ lo: 0.025, hi: 0.975 });
  });
});

describe("wilson", () => {
  it("gives the score interval, not the normal approximation", () => {
    const round = (successes: number, n: number) => {
      const { lo, hi } = wilson(successes, n);
      return [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100];
    };
    expect(round(14, 32)).toEqual([0.28, 0.61]);
    expect(round(17, 32)).toEqual([0.36, 0.69]);
    expect(round(29, 32)).toEqual([0.76, 0.97]);
    // The normal approximation would run past 1 here and has no width at 32 of 32.
    expect(wilson(32, 32).hi).toBe(1);
    expect(wilson(32, 32).lo).toBeCloseTo(0.8928, 3);
    expect(wilson(0, 32).lo).toBe(0);
  });
});
