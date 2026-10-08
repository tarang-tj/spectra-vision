/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { EffectDef } from "../effects";
import type { ModeDef } from "../modes";
import { MAX_MODE_KEYS } from "./shortcuts";

export type Command = {
  id: string;
  label: string;
  /** Section heading in the palette: "Mode", "Effect" or "Studio". */
  group: string;
  /** Optional shortcut or state shown at the end of the row. */
  hint?: string;
  run(): void;
};

/** Everything the palette can do that is not a registry entry. */
export type StudioActions = {
  record(): void;
  screenshot(): void;
  mirror(): void;
  pause(): void;
  effects(): void;
  immersive(): void;
  help(): void;
  exportSession(): void;
  demo(): void;
  tour(): void;
};

/** Builds the palette from the registries, so a new mode or effect is listed
 * without an edit here. */
export function buildCommands(input: {
  modes: readonly ModeDef[];
  effects: readonly EffectDef[];
  effectsOn: Readonly<Record<string, boolean>>;
  paused: boolean;
  immersive: boolean;
  setMode(id: string): void;
  toggleEffect(id: string): void;
  actions: StudioActions;
}): Command[] {
  const { actions } = input;
  return [
    ...input.modes.map((mode, i) => ({
      id: `mode:${mode.id}`,
      label: mode.label,
      group: "Mode",
      hint: i < MAX_MODE_KEYS ? String(i + 1) : undefined,
      run: () => input.setMode(mode.id),
    })),
    ...input.effects.map((effect) => ({
      id: `effect:${effect.id}`,
      label: effect.label,
      group: "Effect",
      hint: input.effectsOn[effect.id] ? "On" : "Off",
      run: () => input.toggleEffect(effect.id),
    })),
    studio("record", "Start or stop recording", "R", actions.record),
    studio("screenshot", "Save a screenshot", "S", actions.screenshot),
    studio("mirror", "Mirror the view", "M", actions.mirror),
    studio(
      "pause",
      input.paused ? "Resume detection" : "Pause detection",
      undefined,
      actions.pause,
    ),
    studio("effects", "Open or close the effects tray", "E", actions.effects),
    studio(
      "immersive",
      input.immersive ? "Leave the immersive view" : "Enter the immersive view",
      undefined,
      actions.immersive,
    ),
    studio("demo", "Use the demo image", undefined, actions.demo),
    studio("export", "Export session", undefined, actions.exportSession),
    studio("help", "Privacy, controls and shortcuts", "?", actions.help),
    studio("tour", "Show the getting started tips", undefined, actions.tour),
  ];
}

const studio = (
  id: string,
  label: string,
  hint: string | undefined,
  run: () => void,
): Command => ({ id: `studio:${id}`, label, group: "Studio", hint, run });

/** Commands whose label or group contains every word of the query, with
 * matches at the start of the label first. Registry order breaks ties. */
export function filterCommands(
  commands: readonly Command[],
  query: string,
): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...commands];
  const scored: { command: Command; score: number; index: number }[] = [];
  commands.forEach((command, index) => {
    const label = command.label.toLowerCase(),
      text = `${label} ${command.group.toLowerCase()}`;
    if (!words.every((word) => text.includes(word))) return;
    scored.push({
      command,
      score: label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2,
      index,
    });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.command);
}
