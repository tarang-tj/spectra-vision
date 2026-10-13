/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import { NARROW } from "./device";

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
