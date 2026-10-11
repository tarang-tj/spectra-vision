/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Runs a real worker script from public/ in the test process, with stand-ins
// for the globals a worker has. The worker tests each carried a copy of this.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The text of a worker script under public/. */
export const workerSource = (file: string): string =>
  readFileSync(resolve("public", file), "utf8");

type Handler = ((event: { data: unknown }) => Promise<void>) | null;

/** Evaluate the script with `self` and the named globals. Every message the
 * script posts goes to `onPost`; `send` delivers a message to it. `extra`
 * is added to `self` (navigator, location). */
export function runWorker<Extra extends object = object>(
  source: string,
  globals: Record<string, unknown>,
  onPost: (message: Record<string, unknown>, transfer: unknown[]) => void,
  extra?: Extra,
) {
  const self = {
    onmessage: null as Handler,
    postMessage: (message: Record<string, unknown>, transfer: unknown[] = []) =>
      onPost(message, transfer),
    ...extra,
  } as {
    onmessage: Handler;
    postMessage(message: Record<string, unknown>, transfer?: unknown[]): void;
  } & Extra &
    Record<string, unknown>;
  new Function("self", ...Object.keys(globals), source)(
    self,
    ...Object.values(globals),
  );
  return { self, send: (data: unknown) => self.onmessage!({ data }) };
}

/** A canvas that gives a 2d context and nothing else. */
export class FlatCanvas {
  getContext(kind: string) {
    return kind === "2d" ? { drawImage() {} } : null;
  }
}

/** What every vision-worker test stands in: no script import, a fileset
 * resolver beside the given tasks, a canvas and a four-byte model file. */
export const visionGlobals = (
  vision: Record<string, unknown>,
  canvas: unknown = FlatCanvas,
): Record<string, unknown> => ({
  importScripts: () => {},
  Vision: { FilesetResolver: { forVisionTasks: async () => ({}) }, ...vision },
  OffscreenCanvas: canvas,
  fetch: async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }),
});
