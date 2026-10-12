/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  afterPermissionChange,
  cameraCard,
  classify,
  platformOf,
} from "../src/vision/camera-errors";
import type { CameraErrorCode } from "../src/vision/camera-errors";
import { stageCard } from "../src/shell/stage-card";

const named = (name: string, message = "") =>
  Object.assign(new Error(message), { name });
const code = (
  name: string,
  permission: "granted" | "denied" | "prompt" | "unknown",
  waitedMs = 0,
  message = "",
) => classify(named(name, message), { permission, waitedMs }).code;

describe("sorting a camera failure", () => {
  it("tells a block from a closed prompt from a system block", () => {
    expect(code("NotAllowedError", "denied", 4000)).toBe("blocked");
    expect(code("NotAllowedError", "prompt", 4000)).toBe("dismissed");
    expect(code("NotAllowedError", "granted", 10)).toBe("refused");
    expect(
      code("NotAllowedError", "denied", 10, "Permission denied by system"),
    ).toBe("system-blocked");
  });
  it("does not call a refusal that came back at once a closed prompt", () => {
    // No person reads and closes a prompt in 50 ms: nothing was shown.
    expect(code("NotAllowedError", "prompt", 50)).toBe("blocked");
    expect(code("NotAllowedError", "unknown", 4000)).toBe("blocked");
  });
  it("sorts the other names", () => {
    expect(code("NotFoundError", "prompt")).toBe("none");
    expect(code("NotReadableError", "granted")).toBe("busy");
    expect(code("AbortError", "granted")).toBe("busy");
    expect(code("OverconstrainedError", "granted")).toBe("gone");
    expect(code("SecurityError", "prompt")).toBe("unknown");
  });
  it("never leaves the detail empty, even for an error with no message", () => {
    expect(
      classify(named("OverconstrainedError"), {
        permission: "granted",
        waitedMs: 0,
      }).detail,
    ).toBe("OverconstrainedError");
    expect(
      classify(named("TypeError", "bad constraints"), {
        permission: "unknown",
        waitedMs: 0,
      }).detail,
    ).toBe("TypeError: bad constraints");
    expect(classify("nope", { permission: "unknown", waitedMs: 0 })).toEqual({
      code: "unknown",
      detail: "nope",
    });
  });
  it("rewords the card when the permission changes under it", () => {
    expect(afterPermissionChange("blocked", "prompt")).toBe("dismissed");
    expect(afterPermissionChange("dismissed", "denied")).toBe("blocked");
    expect(afterPermissionChange("blocked", "unknown")).toBe("blocked");
    expect(afterPermissionChange("none", "prompt")).toBe("none");
  });
});

describe("the words for each failure", () => {
  const CODES: CameraErrorCode[] = [
    "blocked",
    "dismissed",
    "system-blocked",
    "refused",
    "none",
    "busy",
    "gone",
    "insecure",
    "lost",
    "unknown",
  ];
  const card = (c: CameraErrorCode, detail = "") =>
    cameraCard({ code: c, detail }, "desktop");
  it("gives every cause its own heading and its own sentence", () => {
    // One heading is shared on purpose: a refusal the browser does not
    // explain is a block too, and only its advice differs.
    expect(card("refused").title).toBe(card("blocked").title);
    expect(new Set(CODES.map((c) => card(c).title)).size).toBe(
      CODES.length - 1,
    );
    expect(card("refused").fix).not.toBe(card("blocked").fix);
    expect(new Set(CODES.map((c) => card(c).text)).size).toBe(CODES.length);
  });
  it("never repeats the heading as the sentence, and uses no em dash", () => {
    for (const c of CODES) {
      const { title, text, fix } = card(c);
      expect(text.startsWith(title)).toBe(false);
      expect(text.length).toBeGreaterThan(20);
      expect(title + text + fix).not.toMatch(/[–—]/);
    }
  });
  it("offers no retry where a retry cannot work", () => {
    expect(card("insecure").retry).toBeNull();
    expect(card("dismissed").retry).toBe("Ask again");
    expect(card("blocked").retry).toBe("Retry camera");
  });
  it("says where to lift a block, per platform", () => {
    const fix = (p: "desktop" | "android" | "ios") =>
      cameraCard({ code: "blocked", detail: "" }, p).fix;
    expect(fix("desktop")).toContain("address bar");
    expect(fix("android")).toContain("Permissions");
    expect(fix("ios")).toContain("Website Settings");
    expect(new Set([fix("desktop"), fix("android"), fix("ios")]).size).toBe(3);
    // Allowed for the site and still refused: point at the device as well.
    const refused = (p: "desktop" | "android" | "ios") =>
      cameraCard({ code: "refused", detail: "" }, p).fix;
    expect(refused("desktop")).toContain("system privacy settings");
    expect(refused("android")).toContain("phone's Settings");
    expect(refused("ios")).toContain("Settings app");
  });
  it("shows the browser's own words for a failure it does not know", () => {
    expect(card("unknown", "SecurityError: nope").text).toContain(
      "SecurityError: nope",
    );
    expect(card("unknown").text).toContain("no reason");
  });
  it("reads the platform from the browser's name", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", 5)).toBe(
      "ios",
    );
    // An iPad says it is a Mac; a Mac has no touch screen.
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5)).toBe(
      "ios",
    );
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0)).toBe(
      "desktop",
    );
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5)).toBe(
      "android",
    );
  });
});

describe("the stage card", () => {
  it("is absent when nothing failed", () => {
    expect(stageCard(null, "", "desktop")).toBeNull();
  });
  it("retries the demo, not the camera, when the demo failed", () => {
    const card = stageCard(
      { from: "demo", text: "Demo image could not load." },
      "",
      "desktop",
    )!;
    expect(card.retry).toBe("Retry demo");
    expect(card.demo).toBe(false);
    expect(card.camera).toBe(false);
  });
  it("offers a file that did not open the demo and no retry", () => {
    const card = stageCard({ from: "file", text: "x" }, "", "desktop")!;
    expect(card.retry).toBeNull();
    expect(card.demo).toBe(true);
  });
  it("puts a source failure before a model failure", () => {
    const card = stageCard(
      { from: "camera", failure: { code: "none", detail: "" } },
      "Model failed",
      "desktop",
    )!;
    expect(card.title).toBe("No camera found.");
    expect(card.camera).toBe(true);
  });
  it("keeps the model card's words", () => {
    expect(stageCard(null, "This device is offline.", "desktop")).toMatchObject(
      { title: "You are offline.", retry: "Retry model" },
    );
    expect(stageCard(null, "Model failed", "desktop")!.title).toBe(
      "Let’s get you seeing.",
    );
  });
});
