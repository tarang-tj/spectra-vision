/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Saving a file the page built in memory. The browser writes it to the
// downloads folder; nothing is uploaded.

/** Hand a blob to the browser as a local file download. */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save text as a file of the given media type. */
export const downloadText = (name: string, text: string, type: string) =>
  downloadBlob(name, new Blob([text], { type }));
