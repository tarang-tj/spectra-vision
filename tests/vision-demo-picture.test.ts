/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modes } from "../src/modes";
import { PHONE_STILLS, demoStill } from "../src/vision/demo-picture";

describe("the demo picture for a small screen", () => {
  it("is the WebP beside a listed still, only when the screen is small", () => {
    expect(demoStill("demo/studio.png", true)).toBe("demo/studio-phone.webp");
    expect(demoStill("demo/studio.png", false)).toBe("demo/studio.png");
  });
  it("leaves a still that has no smaller file alone", () => {
    expect(demoStill("demo/other.png", true)).toBe("demo/other.png");
    expect(demoStill("demo/clip.mp4", true)).toBe("demo/clip.mp4");
  });
  it("lists every still a mode shows, and each smaller file is on disk and at most 400 kB", () => {
    const stills = [...new Set(modes.map((mode) => mode.demo.still))].sort();
    expect([...PHONE_STILLS].sort()).toEqual(stills);
    for (const still of PHONE_STILLS) {
      const file = `public/${demoStill(still, true)}`;
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeLessThanOrEqual(400_000);
      expect(statSync(file).size, file).toBeLessThan(
        statSync(`public/${still}`).size,
      );
    }
  });
});
