/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Tells a model that could not be fetched from a model that could not run.
// A failed download says nothing about the GPU, so the task runner neither
// retries it on CPU (the same fetch would fail again) nor records a GPU
// failure for it. Pure, so it is unit-tested.

/** Shown when the device is offline and the files are not on it. The stage's
 * error state reads its heading from the start of this text. */
export const OFFLINE_MESSAGE =
  "This device is offline, and this mode's model is not stored on it yet. Go online once to download it; after that it works offline.";

// What the browsers say for a fetch that never got an answer (Chrome, Firefox,
// Safari), for a worker script that would not load, and the workers' own
// "HTTP 404 for <address>" when the server answered with an error.
const FETCH_ERROR =
  /failed to fetch|networkerror|load failed|failed to load|network error|err_internet_disconnected|HTTP \d{3} for /i;

/** The message to show when `error` is a download that failed, or null when
 * it is anything else (a model that would not start, a lost GPU). `online` is
 * `navigator.onLine`. A worker that did not start at all while offline counts
 * too: its script is one of the files that could not be fetched. */
export function downloadFailure(error: string, online: boolean): string | null {
  const fetching = FETCH_ERROR.test(error);
  if (!online && (fetching || /^Vision worker failed/.test(error)))
    return OFFLINE_MESSAGE;
  if (!fetching) return null;
  const reason = error.replace(/^Vision model failed: /, "");
  return `The model could not be downloaded (${reason}). Check your connection and retry.`;
}
