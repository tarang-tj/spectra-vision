/** Download the session as JSON. Created in memory and saved by the browser:
 * nothing is uploaded, and no media is included. */
export function downloadSession(
  mode: string,
  source: string | null,
  settings: Record<string, unknown>,
  frames: unknown[],
) {
  const payload = {
    app: "SPECTRA",
    version: "1.1.0",
    exportedAt: new Date().toISOString(),
    mode,
    source,
    settings,
    notes:
      "Latest 1000 processed frames of this source and mode. Image-normalized coordinates; no media included. Timestamps are monotonic page time.",
    frames,
  };
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `spectra-${mode}-session.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
