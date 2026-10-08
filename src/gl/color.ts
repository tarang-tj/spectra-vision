/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** The product's accent colours as 0..1 red, green, blue triples, taken from
 * the design tokens (docs/design/implementation-spec.md). Effects draw light
 * in these and nothing else, so they belong on the same stage. */
export type Rgb = readonly [number, number, number];

/** "#a4ffd9" to [0.643, 1, 0.851]. Returns white for anything unparseable. */
export function rgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [1, 1, 1];
  const value = parseInt(match[1], 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export const MINT = rgb("#a4ffd9"),
  BLUE = rgb("#67aaff"),
  LAVENDER = rgb("#ae94fa"),
  WHITE = rgb("#f3f7f6");
/** The accent cycle used for the first, second and third tracked thing. */
export const ACCENTS: readonly Rgb[] = [MINT, BLUE, LAVENDER];

/** Sample a ramp of evenly spaced colours at t (0..1) into `out`. */
export function ramp(
  stops: readonly Rgb[],
  t: number,
  out: number[] | Float32Array,
) {
  const last = stops.length - 1;
  if (last < 0) return out;
  const x = (t < 0 ? 0 : t > 1 ? 1 : t) * last,
    i = Math.min(last, Math.floor(x)),
    j = Math.min(last, i + 1),
    f = x - i;
  for (let c = 0; c < 3; c++)
    out[c] = stops[i][c] + (stops[j][c] - stops[i][c]) * f;
  return out;
}

/** GLSL constants for the same three accents, for shaders. */
export const ACCENT_GLSL = `
const vec3 MINT = vec3(${MINT.map((v) => v.toFixed(4)).join(", ")});
const vec3 BLUE = vec3(${BLUE.map((v) => v.toFixed(4)).join(", ")});
const vec3 LAVENDER = vec3(${LAVENDER.map((v) => v.toFixed(4)).join(", ")});
`;
