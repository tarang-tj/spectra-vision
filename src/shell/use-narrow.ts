/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";

// The width at and below which the page is one column (see the 760px rules
// in src/styles).
const NARROW = "(max-width: 760px)";

const subscribe = (changed: () => void) => {
  const query = matchMedia(NARROW);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

/** True in the one-column layout. The shell uses it to put the markup in the
 * order the page is read in, so keyboard focus follows what is on screen. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(NARROW).matches);
}
