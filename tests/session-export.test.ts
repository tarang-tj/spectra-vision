/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  EXPORT_BYTE_LIMIT,
  EXPORT_FRAME_LIMIT,
  exportNumber,
  exportedSize,
  frameLimit,
} from "../src/session-export";

describe("session export limits", () => {
  it("rounds coordinates to five places and leaves integers alone", () => {
    const text = JSON.stringify(
      { x: 0.123456789, y: 1 / 3, n: 478, t: 1234, z: -0.000004 },
      exportNumber,
    );
    expect(JSON.parse(text)).toEqual({
      x: 0.12346,
      y: 0.33333,
      n: 478,
      t: 1234,
      z: 0,
    });
  });
  it("keeps 1000 small frames and fewer large ones, inside the byte limit", () => {
    const point = { x: 0.123456789, y: 0.987654321, z: -0.05 },
      body = { landmarks: [Array.from({ length: 33 }, () => point)] },
      face = { landmarks: [Array.from({ length: 478 }, () => point)] };
    expect(frameLimit(exportedSize(body))).toBe(EXPORT_FRAME_LIMIT);
    const kept = frameLimit(exportedSize(face));
    expect(kept).toBeLessThan(EXPORT_FRAME_LIMIT);
    expect(kept).toBeGreaterThan(100);
    expect(kept * exportedSize(face)).toBeLessThanOrEqual(EXPORT_BYTE_LIMIT);
    expect(frameLimit(EXPORT_BYTE_LIMIT * 3)).toBe(1);
  });
});
