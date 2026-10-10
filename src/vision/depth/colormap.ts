/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The depth map's colours. A viridis-like scale: dark purple through teal to
// bright yellow, with lightness rising all the way, so the order still reads
// in greyscale and for the common kinds of colour blindness. Pure.

/** Nine evenly spaced anchors of the viridis scale, as RGB bytes. */
const ANCHORS: readonly (readonly [number, number, number])[] = [
  [68, 1, 84],
  [71, 45, 123],
  [59, 82, 139],
  [44, 114, 142],
  [33, 145, 140],
  [40, 174, 128],
  [94, 201, 98],
  [173, 220, 48],
  [253, 231, 37],
];

export const COLOR_STEPS = 256;

/** The colour at position t of the scale (0 dark, 1 bright), as RGB bytes. */
export function colorAt(t: number): [number, number, number] {
  const clamped = t < 0 || !(t === t) ? 0 : t > 1 ? 1 : t,
    at = clamped * (ANCHORS.length - 1),
    i = Math.min(ANCHORS.length - 2, Math.floor(at)),
    f = at - i,
    a = ANCHORS[i],
    b = ANCHORS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Relative luminance of an sRGB colour (0 black, 1 white), the quantity a
 * greyscale print or a colour-blind eye still separates. */
export function luminance([r, g, b]: readonly number[]): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

let table: Uint8ClampedArray | null = null;
/** The whole scale as COLOR_STEPS RGBA entries, built once. */
export function colorTable(): Uint8ClampedArray {
  if (table) return table;
  table = new Uint8ClampedArray(COLOR_STEPS * 4);
  for (let i = 0; i < COLOR_STEPS; i++) {
    const [r, g, b] = colorAt(i / (COLOR_STEPS - 1));
    table.set([r, g, b, 255], i * 4);
  }
  return table;
}

/** Colour every value of a depth map into RGBA bytes: the largest value (the
 * nearest point) is the bright end, the smallest the dark end. A map with one
 * value everywhere is the dark end throughout. */
export function colorize(
  values: Float32Array,
  min: number,
  max: number,
  out: Uint8ClampedArray,
): Uint8ClampedArray {
  const lut = colorTable(),
    span = max - min,
    scale = span > 0 ? (COLOR_STEPS - 1) / span : 0;
  for (let i = 0; i < values.length; i++) {
    const raw = Math.round((values[i] - min) * scale),
      at = (raw < 0 ? 0 : raw > COLOR_STEPS - 1 ? COLOR_STEPS - 1 : raw) * 4;
    out[i * 4] = lut[at];
    out[i * 4 + 1] = lut[at + 1];
    out[i * 4 + 2] = lut[at + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
