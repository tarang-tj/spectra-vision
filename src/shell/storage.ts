/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Small local preferences (the coach marks' "seen" flag). Storage can be
 * blocked or full, so every call is guarded and a failure only means the
 * preference is not remembered. Nothing here ever leaves the browser. */
export function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private mode or a full quota: carry on without remembering. */
  }
}
