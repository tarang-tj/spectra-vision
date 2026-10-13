/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a desktop browser at a phone's size can read off the page: how wide it
// is, how big each thing a finger presses is, and how small its text gets.
// `audit` runs inside the page (page.evaluate). It says nothing about a real
// phone: its bars, its keyboard, its notch and its speed are not here.
import { expect, type Page } from "@playwright/test";

export type Audit = {
  width: number;
  height: number;
  scrollWidth: number;
  /** Press targets under 44 by 44 CSS px, as "name WxH". */
  small: string[];
  /** Visible text under 12 px, as "name NNpx". */
  tiny: string[];
  /** Text fields under 16 px (iOS zooms the page on those). */
  fields: string[];
};

export function audit(): Audit {
  const seen = (el: Element) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        Number(s.opacity) > 0
      );
    },
    name = (el: Element) => {
      const cls =
          typeof el.className === "string" && el.className
            ? "." + el.className.trim().split(/\s+/).join(".")
            : "",
        label =
          el.getAttribute("aria-label") ||
          (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
      return `${el.parentElement?.tagName.toLowerCase()} > ${el.tagName.toLowerCase()}${cls} "${label}"`;
    },
    // A link in the middle of a sentence is left at the size of its words.
    inline = (el: Element) =>
      el.tagName === "A" &&
      getComputedStyle(el).display === "inline" &&
      [...(el.parentElement?.childNodes ?? [])].some(
        (node) => node.nodeType === 3 && (node.textContent ?? "").trim(),
      );
  const small = [
    ...document.querySelectorAll(
      'button, a[href], select, summary, textarea, label.button, input:not([type="hidden"])',
    ),
  ]
    .filter((el) => seen(el) && !inline(el))
    .map((el) => {
      let r = el.getBoundingClientRect();
      // A tick box is pressed through its label.
      const label = el.closest("label");
      if (label && el.tagName === "INPUT") {
        const lr = label.getBoundingClientRect();
        if (lr.width * lr.height > r.width * r.height) r = lr;
      }
      return { name: name(el), w: r.width, h: r.height };
    })
    .filter((t) => t.w < 43.5 || t.h < 43.5)
    .map((t) => `${t.name} ${Math.round(t.w)}x${Math.round(t.h)}`);
  const tiny = new Set<string>(),
    walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!(n.textContent ?? "").trim() || !el || !seen(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    // Size 0 is an icon whose words are kept for screen readers only.
    if (px >= 0.1 && px < 11.95) tiny.add(`${name(el)} ${px}px`);
  }
  const fields = [...document.querySelectorAll("input, select, textarea")]
    .filter(seen)
    .filter(
      (el) =>
        !["checkbox", "radio", "range", "file"].includes(
          (el as HTMLInputElement).type,
        ),
    )
    .map((el) => ({ el, px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((f) => f.px < 16)
    .map((f) => `${name(f.el)} ${f.px}px`);
  return {
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    small,
    tiny: [...tiny],
    fields,
  };
}

export const PANELS = ["Inspect", "Lab", "Library", "Ruler", "Presence"];
/** Words only each panel's own body shows: a panel is fetched on demand, so
 * a test waits for these after pressing its tab. */
export const PANEL_WORDS: Record<string, string> = {
  Inspect: "In the frame",
  Lab: "Measured in this browser, on this device.",
  Library: "The names the Objects models can give.",
  Ruler: "Lay a sheet of known size flat on the surface",
  Presence: "Presence reads the body, hand and face models together",
};
export const tab = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
export const modeButton = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Vision mode" })
    .getByRole("button", { name, exact: true });

/** Press a panel's tab and wait for that panel's own words. */
export async function openTab(page: Page, name: string) {
  await tab(page, name).click();
  await expect(page.locator(".panel-body")).toContainText(PANEL_WORDS[name]);
}

/** Open the page with the tips already seen and wait for the demo picture. */
export async function openPage(page: Page, query = "?spectra-test") {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto(`./${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".hud-badge").first()).toHaveText("DEMO IMAGE");
}
