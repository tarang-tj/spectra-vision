/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** What the share card shows: a clip the recorder just produced in this
 * session. */
export type ShareResult = {
  /** Object URL of the recorded blob. The card revokes it when dismissed. */
  url: string;
  mime: string;
  seconds: number;
  mode: string;
  file: string;
};

/** The public address of this copy of SPECTRA: the site root, without any
 * query or hash. It is the only thing "Copy link" ever copies. */
export function studioLink(origin: string, base: string): string {
  return new URL(base, origin).href;
}

/** Copy text with the async clipboard API. Returns false when the browser
 * refuses (no permission, insecure origin) so the caller can say so. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
