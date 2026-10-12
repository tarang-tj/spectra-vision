/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import catalogue from "../scripts/models.json";
import depth from "../src/modes/depth";
import objects from "../src/modes/objects";
import { tasksOf } from "../src/modes/types";
import {
  downloadNote,
  firstDownloadNote,
  megabytes,
} from "../src/vision/first-download";
import { noteDelegate, resetModelChoice } from "../src/vision/model-choice";

const BASE = "https://site.example/app/";
const storing = (stored: string[]) => ({
  asked: [] as string[],
  async match(request: RequestInfo | URL) {
    this.asked.push(String(request));
    return stored.includes(String(request)) ? new Response("") : undefined;
  },
});
const big = { model: "big.onnx", options: { bytes: 99_173_678 } };

describe("the first-download line", () => {
  it("gives the size once and says the model is kept, when it will be", async () => {
    const caches = storing([]);
    const note = await firstDownloadNote([big], BASE, {
      caches,
      registered: async () => true,
    });
    expect(note).toBe(
      "Downloading this mode's model: 99 MB, one time. It is kept on this device afterwards",
    );
    expect(note!.match(/MB/g)).toHaveLength(1);
    expect(caches.asked).toEqual([`${BASE}models/big.onnx`]);
  });
  it("does not promise keeping without a service worker", async () => {
    for (const env of [
      { caches: storing([]), registered: async () => false },
      { caches: storing([]) },
      {},
      {
        caches: storing([]),
        registered: async () => Promise.reject(new Error("blocked")),
      },
    ])
      expect(await firstDownloadNote([big], BASE, env)).toBe(
        "Downloading this mode's model: 99 MB, one time",
      );
  });
  it("says nothing when the model is already stored on the device", async () => {
    expect(
      await firstDownloadNote([big], BASE, {
        caches: storing([`${BASE}models/big.onnx`]),
        registered: async () => true,
      }),
    ).toBeNull();
  });
  it("says nothing for a task that states no size", async () => {
    const caches = storing([]);
    expect(
      await firstDownloadNote([{ model: "small.task", options: {} }], BASE, {
        caches,
        registered: async () => true,
      }),
    ).toBeNull();
    expect(caches.asked).toEqual([]);
  });
  it("treats blocked storage as nothing stored", async () => {
    const note = await firstDownloadNote([big], BASE, {
      caches: {
        match: async () => {
          throw new Error("SecurityError");
        },
      },
      registered: async () => true,
    });
    expect(note).toMatch(/99 MB/);
  });
  it("Depth states the size the manifest gives for its model", () => {
    const spec = tasksOf(depth)[0],
      listed = catalogue.find((m) => m.file === spec.model)!;
    expect(spec.options.bytes).toBe(listed.bytes);
    // 99 MB, the figure the on-screen audit measured on the wire (98.75 MB).
    expect(megabytes(listed.bytes)).toBe("99 MB");
    expect(downloadNote(listed.bytes, true)).toContain("99 MB");
  });
});

describe("Objects' first download", () => {
  const spec = tasksOf(objects)[0],
    env = (stored: string[]) => ({
      caches: storing(stored),
      registered: async () => false,
    });
  it("states sizes that are the manifest's", () => {
    for (const [file, bytes] of Object.entries(spec.sizes!))
      expect([file, bytes]).toEqual([
        file,
        catalogue.find((entry) => entry.file === file)!.bytes,
      ]);
    expect(Object.keys(spec.sizes!).sort()).toEqual(
      [spec.model, spec.gpuModel!, spec.sharpModel!].sort(),
    );
    // The size is not handed to MediaPipe as a task option.
    expect(spec.options).not.toHaveProperty("bytes");
  });
  it("gives the size of the model the task is loading, per delegate", async () => {
    resetModelChoice();
    try {
      const cpu = env([]);
      expect(await firstDownloadNote([spec], BASE, cpu)).toBe(
        "Downloading this mode's model: 7 MB, one time",
      );
      expect(cpu.caches.asked).toEqual([`${BASE}models/${spec.model}`]);
      // Its runner is on a real GPU: the larger file is what is fetched.
      noteDelegate("object", "GPU");
      const gpu = env([`${BASE}models/${spec.model}`]);
      expect(await firstDownloadNote([spec], BASE, gpu)).toBe(
        "Downloading this mode's model: 12 MB, one time",
      );
      expect(gpu.caches.asked).toEqual([`${BASE}models/${spec.gpuModel}`]);
    } finally {
      resetModelChoice();
    }
  });
  it("says nothing once that model is stored", async () => {
    expect(
      await firstDownloadNote(
        [spec],
        BASE,
        env([`${BASE}models/${spec.model}`]),
      ),
    ).toBeNull();
  });
});
