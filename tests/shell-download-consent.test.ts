/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, describe, expect, it, vi } from "vitest";
import catalogue from "../scripts/models.json";
import depth from "../src/modes/depth";
import { modes } from "../src/modes";
import { tasksOf } from "../src/modes/types";
import { resetDevice } from "../src/shell/device";
import {
  BIG_DOWNLOAD_BYTES,
  acceptDownload,
  consentWords,
  downloadCleared,
  needsConsent,
  onConsent,
  resetConsent,
} from "../src/shell/download-consent";
import { firstDownloadBytes } from "../src/vision/first-download";

const BASE = "https://site.example/app/",
  DEPTH = "depth_anything_v2_small.onnx",
  spec = tasksOf(depth)[0];
const touch = (yes: boolean) =>
  vi.stubGlobal("matchMedia", () => ({ matches: yes }));
const storing = (stored: string[]) => ({
  match: async (request: RequestInfo | URL) =>
    stored.includes(String(request)) ? new Response("") : undefined,
});
/** Let the size lookup behind `downloadCleared` finish. */
const settled = () => new Promise((done) => setTimeout(done, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  resetDevice();
  resetConsent();
});

describe("the ask-first rule", () => {
  it("asks only on touch, only above 30 MB, only until the person said yes", () => {
    expect(BIG_DOWNLOAD_BYTES).toBe(30_000_000);
    expect(needsConsent(30_000_000, true, false)).toBe(false);
    expect(needsConsent(30_000_001, true, false)).toBe(true);
    expect(needsConsent(99_000_000, false, false)).toBe(false);
    expect(needsConsent(99_000_000, true, true)).toBe(false);
  });
  it("sits above every model a mode loads by itself but Depth's", async () => {
    for (const mode of modes) {
      const bytes = await firstDownloadBytes(tasksOf(mode), BASE, {});
      expect(needsConsent(bytes, true, false), mode.id).toBe(
        mode.id === "depth",
      );
    }
  });
});

describe("what is still to download", () => {
  it("is the model's size from the manifest, and nothing once it is stored", async () => {
    const bytes = catalogue.find((m) => m.file === DEPTH)!.bytes;
    expect(bytes).toBeGreaterThan(90_000_000);
    expect(await firstDownloadBytes([spec], BASE, {})).toBe(bytes);
    expect(
      await firstDownloadBytes([spec], BASE, {
        caches: storing([`${BASE}models/${DEPTH}`]),
      }),
    ).toBe(0);
  });
});

describe("a model another control asks for (Measure objects)", () => {
  it("is never held back where the main pointer is not touch", () => {
    touch(false);
    expect(downloadCleared(spec, BASE, {})).toBe(true);
  });
  it("waits for a yes on touch, says so to its listeners, and is free after it", async () => {
    touch(true);
    const heard = vi.fn(),
      off = onConsent(heard);
    // Not known yet: held back while the size is looked up.
    expect(downloadCleared(spec, BASE, {})).toBe(false);
    await settled();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(downloadCleared(spec, BASE, {})).toBe(false);
    acceptDownload(DEPTH);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(downloadCleared(spec, BASE, {})).toBe(true);
    off();
  });
  it("does not ask for a model this device already stores", async () => {
    touch(true);
    const env = { caches: storing([`${BASE}models/${DEPTH}`]) };
    expect(downloadCleared(spec, BASE, env)).toBe(false);
    await settled();
    expect(downloadCleared(spec, BASE, env)).toBe(true);
  });
});

describe("the card's words", () => {
  it("state the size from the bytes, and promise keeping only when it is kept", () => {
    const words = consentWords("Depth", 99_060_839, false);
    expect(words.title).toBe("Depth needs a 99 MB download");
    expect(words.text).toBe(
      "Depth's model is 99 MB, plus its runtime. Nothing is shown in Depth until it has arrived.",
    );
    expect(words.accept).toBe("Download 99 MB");
    expect(consentWords("Depth", 99_060_839, true).text).toBe(
      `${words.text} It is kept on this device afterwards.`,
    );
  });
});
