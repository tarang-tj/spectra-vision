/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** True only when the page was opened with `?spectra-test`. The two hooks the
 * browser tests read or set (GL object counters, a shortened benchmark) exist
 * only then, so a normal visit to the public site has no test globals. */
export function testHooksEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has("spectra-test");
  } catch {
    return false;
  }
}
