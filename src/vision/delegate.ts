import type { Delegate } from "./types";

/** Decide how to recover when a vision task fails. A GPU task that has not
 * produced a single result yet is retried once on CPU; anything else (a CPU
 * failure, or a GPU task that was working and then broke) is a real error.
 * Returns the delegate to retry with, or null to surface the error. */
export function fallbackDelegate(
  active: Delegate,
  produced: boolean,
): Delegate | null {
  return active === "GPU" && !produced ? "CPU" : null;
}
