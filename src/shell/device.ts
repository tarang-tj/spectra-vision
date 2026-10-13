/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What kind of device the page is on, read from the browser's own media
// queries and never from the user agent string. Each answer is a guess about
// the device: the page says "touch" where it leans on one, never "phone".

/** The width at and below which the page is one column (see the 760px rules
 * in src/styles). */
export const NARROW = "(max-width: 760px)";
const TOUCH = "(pointer: coarse) and (hover: none)";

/** False where there is no matchMedia (unit tests, workers) or it throws. */
const matches = (query: string): boolean => {
  try {
    return typeof matchMedia === "function" && matchMedia(query).matches;
  } catch {
    return false;
  }
};

let touch: boolean | undefined;
/** True where touch is the main way in: a phone or a tablet, not a laptop
 * with a touch screen and a trackpad. Asked once per page load and kept. */
export const touchFirst = (): boolean => (touch ??= matches(TOUCH));

/** True where a smaller demo picture is enough: touch first, or one column
 * right now. */
export const smallScreen = (): boolean => touchFirst() || matches(NARROW);

/** Test hook: ask the browser again. */
export const resetDevice = () => {
  touch = undefined;
};
