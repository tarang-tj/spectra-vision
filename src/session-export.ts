/** Limits of one exported session. A Face or Fusion frame is tens of
 * kilobytes, so the frame count alone does not bound the file. */
export const EXPORT_FRAME_LIMIT = 1000;
export const EXPORT_BYTE_LIMIT = 8_000_000;
/** Decimal places kept for every non-integer number in the export. Image
 * coordinates are 0..1, so five places is finer than a pixel of any source. */
export const EXPORT_PRECISION = 5;

const SCALE = 10 ** EXPORT_PRECISION;
/** JSON replacer: rounds non-integer numbers to EXPORT_PRECISION places. */
export const exportNumber = (_key: string, value: unknown): unknown =>
  typeof value === "number" && !Number.isInteger(value)
    ? Math.round(value * SCALE) / SCALE
    : value;

/** Size in characters of one frame as it will be written. */
export const exportedSize = (frame: unknown): number =>
  JSON.stringify(frame, exportNumber).length;

/** How many frames of this size a session keeps: at most the frame limit,
 * fewer when that many would pass the byte limit, never less than one. */
export const frameLimit = (frameSize: number): number =>
  Math.max(
    1,
    Math.min(
      EXPORT_FRAME_LIMIT,
      Math.floor(EXPORT_BYTE_LIMIT / Math.max(1, frameSize)),
    ),
  );

/** Download the session as JSON. Created in memory and saved by the browser:
 * nothing is uploaded, and no media is included. The text is written without
 * indentation, in one pass over at most about EXPORT_BYTE_LIMIT characters. */
export function downloadSession(
  mode: string,
  source: string | null,
  settings: Record<string, unknown>,
  frames: unknown[],
) {
  const payload = {
    app: "SPECTRA",
    // The version of this file's schema, not of the app. 1.2.0 added optional
    // per-mode frame keys and the size limit; every 1.1.0 key is unchanged.
    version: "1.2.0",
    exportedAt: new Date().toISOString(),
    mode,
    source,
    settings,
    notes: `Latest processed frames of this source and mode: at most ${EXPORT_FRAME_LIMIT}, fewer when they would pass about ${EXPORT_BYTE_LIMIT / 1_000_000} MB. Image-normalized coordinates, rounded to ${EXPORT_PRECISION} decimal places; no media included. Timestamps are monotonic page time.`,
    frames,
  };
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, exportNumber)], {
        type: "application/json",
      }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `spectra-${mode}-session.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
