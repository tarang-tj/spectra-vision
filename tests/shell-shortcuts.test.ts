/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  SHORTCUTS,
  isTypingTarget,
  matchShortcut,
} from "../src/shell/shortcuts";
import { buildCommands, filterCommands } from "../src/shell/commands";
import type { StudioActions } from "../src/shell/commands";
import { modeColumns } from "../src/shell/layout";
import { studioLink } from "../src/shell/share";
import { buildVersion, workerUrl } from "../src/shell/register-sw";
import type { EffectDef } from "../src/effects";
import type { ModeDef } from "../src/modes";
import type { TaskKind } from "../src/vision/types";

describe("keyboard shortcuts", () => {
  it("maps digits to registered modes only, up to seven", () => {
    expect(matchShortcut({ key: "1" }, 3)).toEqual({ type: "mode", index: 0 });
    expect(matchShortcut({ key: "3" }, 3)).toEqual({ type: "mode", index: 2 });
    expect(matchShortcut({ key: "4" }, 3)).toBeNull();
    expect(matchShortcut({ key: "7" }, 9)).toEqual({ type: "mode", index: 6 });
    expect(matchShortcut({ key: "8" }, 9)).toBeNull();
    expect(matchShortcut({ key: "0" }, 9)).toBeNull();
  });
  it("maps the letter keys in either case, and ? to help", () => {
    expect(matchShortcut({ key: "r" }, 3)).toEqual({ type: "record" });
    expect(matchShortcut({ key: "S" }, 3)).toEqual({ type: "screenshot" });
    expect(matchShortcut({ key: "m" }, 3)).toEqual({ type: "mirror" });
    expect(matchShortcut({ key: "e" }, 3)).toEqual({ type: "effects" });
    expect(matchShortcut({ key: "?" }, 3)).toEqual({ type: "help" });
    expect(matchShortcut({ key: "Escape" }, 3)).toEqual({ type: "escape" });
    expect(matchShortcut({ key: "x" }, 3)).toBeNull();
  });
  it("leaves modified keys to the browser, except Ctrl or Cmd K", () => {
    expect(matchShortcut({ key: "r", ctrlKey: true }, 3)).toBeNull();
    expect(matchShortcut({ key: "s", metaKey: true }, 3)).toBeNull();
    expect(matchShortcut({ key: "1", altKey: true }, 3)).toBeNull();
    expect(matchShortcut({ key: "k", ctrlKey: true }, 3)).toEqual({
      type: "palette",
    });
    expect(matchShortcut({ key: "K", metaKey: true }, 3)).toEqual({
      type: "palette",
    });
    expect(matchShortcut({ key: "k" }, 3)).toBeNull();
  });
  it("ignores a held key repeating", () => {
    expect(matchShortcut({ key: "r", repeat: true }, 3)).toBeNull();
  });
  it("treats text fields as typing, but not sliders or buttons", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
    expect(isTypingTarget({ tagName: "INPUT", type: "range" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it("documents every action the matcher knows", () => {
    expect(SHORTCUTS.map((s) => s.keys)).toEqual([
      "1 to 7",
      "R",
      "S",
      "M",
      "E",
      "?",
      "Ctrl K or ⌘ K",
      "Esc",
    ]);
  });
});

const mode = (id: string, kinds: TaskKind[]): ModeDef => ({
  id,
  label: `${id} mode`,
  short: id,
  order: 10,
  task: kinds.map((kind) => ({
    kind,
    model: `${kind}.task`,
    options: {},
    delegate: "CPU" as const,
  })),
  hint: "",
  demo: { still: "demo/studio.png", label: "Demo" },
  drawBase() {},
  inspector: () => [],
});
const effect = (id: string): EffectDef => ({
  id,
  label: id,
  modes: "*",
  kind: "2d",
  create: () => ({ draw() {}, dispose() {} }),
});

describe("command palette", () => {
  const calls: string[] = [];
  const actions = Object.fromEntries(
    [
      "record",
      "screenshot",
      "mirror",
      "pause",
      "effects",
      "immersive",
      "help",
      "exportSession",
      "demo",
      "tour",
    ].map((name) => [name, () => calls.push(name)]),
  ) as unknown as StudioActions;
  const commands = buildCommands({
    modes: [mode("objects", ["object"]), mode("hands", ["hand"])],
    effects: [effect("trails"), effect("constellation")],
    effectsOn: { trails: true },
    paused: false,
    immersive: false,
    setMode: (id) => calls.push(`mode:${id}`),
    toggleEffect: (id) => calls.push(`effect:${id}`),
    actions,
  });
  it("lists every registered mode and effect plus the studio actions", () => {
    expect(commands.map((c) => c.id).slice(0, 5)).toEqual([
      "mode:objects",
      "mode:hands",
      "effect:trails",
      "effect:constellation",
      "studio:record",
    ]);
    expect(commands.find((c) => c.id === "effect:trails")?.hint).toBe("On");
    expect(commands.find((c) => c.id === "mode:hands")?.hint).toBe("2");
    expect(commands.filter((c) => c.group === "Studio")).toHaveLength(10);
  });
  it("runs what it lists", () => {
    commands.find((c) => c.id === "mode:hands")!.run();
    commands.find((c) => c.id === "effect:constellation")!.run();
    commands.find((c) => c.id === "studio:record")!.run();
    expect(calls).toEqual(["mode:hands", "effect:constellation", "record"]);
  });
  it("filters by every word and puts label prefixes first", () => {
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
    expect(filterCommands(commands, "hands").map((c) => c.id)).toEqual([
      "mode:hands",
    ]);
    expect(filterCommands(commands, "mirror view").map((c) => c.id)).toEqual([
      "studio:mirror",
    ]);
    // "s" starts "Save a screenshot" and "Start or stop recording" before
    // labels that merely contain it.
    expect(filterCommands(commands, "sa")[0].id).toBe("studio:screenshot");
    expect(filterCommands(commands, "effect").map((c) => c.id)).toContain(
      "effect:trails",
    );
    expect(filterCommands(commands, "zzz")).toEqual([]);
  });
});

describe("layout, links and the service worker address", () => {
  it("splits the mobile mode switch into balanced rows", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(modeColumns)).toEqual([
      1, 2, 3, 4, 3, 3, 4, 4,
    ]);
  });
  it("copies the site root at the root and under the Pages subpath", () => {
    expect(studioLink("https://example.com", "/")).toBe("https://example.com/");
    expect(studioLink("https://tarang-tj.github.io", "/spectra-vision/")).toBe(
      "https://tarang-tj.github.io/spectra-vision/",
    );
  });
  it("versions the worker by the entry script's hash, under any base", () => {
    expect(buildVersion("https://x.dev/assets/index-B4x9kQ2p.js")).toBe(
      "B4x9kQ2p",
    );
    expect(buildVersion("https://x.dev/assets/index-Ab_12-xZ.js?t=1")).toBe(
      "Ab_12-xZ",
    );
    expect(buildVersion("http://127.0.0.1:5185/src/shell/register-sw.ts")).toBe(
      "0",
    );
    expect(workerUrl("/", "abc123")).toBe("/sw.js?v=abc123");
    expect(workerUrl("/spectra-vision/", "abc123")).toBe(
      "/spectra-vision/sw.js?v=abc123",
    );
  });
});
