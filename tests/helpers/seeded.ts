/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Seeded noise for tests, so a failure repeats. Each test file used to carry
// its own copy of these. The sequences are exactly the ones those copies
// gave: several assertions are pinned to what the seeded runs produce.
// The mulberry32 generator the tracker simulation uses is the Ruler's own
// `seededRandom` (src/panels/ruler/monte-carlo.ts), and the accuracy fixtures
// keep a generator that is on purpose not that one
// (tests/fixtures/ruler-accuracy-scene.ts).

/** The 32-bit state of a linear congruential generator, stepped per call. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
}

/** Uniform numbers in [0, 1) from `lcg`. */
export function lcgUniform(seed: number): () => number {
  const next = lcg(seed);
  return () => next() / 4294967296;
}

/** One standard normal number from two uniform draws (Box-Muller, the
 * cosine half only). */
export const boxMuller = (uniform: () => number): number =>
  Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());

/** Standard normal numbers from a seed: `boxMuller` over `lcgUniform`. */
export function lcgNormal(seed: number): () => number {
  const uniform = lcgUniform(seed);
  return () => boxMuller(uniform);
}
