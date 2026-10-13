/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDevice, smallScreen, touchFirst } from "../src/shell/device";

const TOUCH = "(pointer: coarse) and (hover: none)",
  NARROW = "(max-width: 760px)";
/** A browser in which exactly these media queries match. */
const browser = (...matching: string[]) => {
  const asked: string[] = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    asked.push(query);
    return { matches: matching.includes(query) };
  });
  return asked;
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetDevice();
});

describe("touchFirst", () => {
  it("is true where the main pointer is coarse and cannot hover", () => {
    const asked = browser(TOUCH);
    expect(touchFirst()).toBe(true);
    expect(asked).toEqual([TOUCH]);
  });
  it("is false where the main pointer is a mouse or a trackpad", () => {
    browser(NARROW);
    expect(touchFirst()).toBe(false);
  });
  it("is false, and does not throw, where matchMedia is missing", () => {
    expect(typeof matchMedia).toBe("undefined");
    expect(touchFirst()).toBe(false);
  });
  it("is false where matchMedia throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("blocked");
    });
    expect(touchFirst()).toBe(false);
  });
  it("asks the browser once per page load", () => {
    const asked = browser(TOUCH);
    touchFirst();
    touchFirst();
    expect(asked).toHaveLength(1);
  });
});

describe("smallScreen", () => {
  it("is true on a touch-first device of any width", () => {
    browser(TOUCH);
    expect(smallScreen()).toBe(true);
  });
  it("is true in a narrow window with a mouse", () => {
    browser(NARROW);
    expect(smallScreen()).toBe(true);
  });
  it("is false on a wide screen with a mouse, and with no matchMedia", () => {
    browser();
    expect(smallScreen()).toBe(false);
    vi.unstubAllGlobals();
    resetDevice();
    expect(smallScreen()).toBe(false);
  });
});
