/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Stills that have a 1280 px WebP beside them, made by
 * scripts/phone-demo-pictures.sh. tests/vision-demo-picture.test.ts holds
 * this list to the stills the modes name and to the files on disk. */
export const PHONE_STILLS: readonly string[] = [
  "demo/studio.png",
  "demo/hands.png",
  "demo/face.png",
  "demo/face-and-hands.png",
];

/** The file to fetch for a mode's demo still: the smaller one on a small
 * screen (shell/device.ts, `smallScreen`), where it exists. */
export const demoStill = (path: string, small: boolean): string =>
  small && PHONE_STILLS.includes(path)
    ? path.replace(/\.png$/, "-phone.webp")
    : path;
