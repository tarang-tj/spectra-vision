/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { effectsFor } from "../effects";
import { modes } from "../modes";
import type { ModeDef } from "../modes";
import { buildCommands } from "./commands";
import type { Command, StudioActions } from "./commands";

/** The command palette's list for the current state. It is built only while
 * the palette is open: nothing needs it otherwise. */
export function paletteCommands(
  open: boolean,
  state: {
    mode: ModeDef;
    effectsOn: Readonly<Record<string, boolean>>;
    paused: boolean;
    immersive: boolean;
    setMode(id: string): void;
    toggleEffect(id: string): void;
    actions: StudioActions;
  },
): Command[] {
  if (!open) return [];
  return buildCommands({
    modes,
    // Only the effects the tray offers in this mode.
    effects: effectsFor(state.mode.id),
    effectsOn: state.effectsOn,
    paused: state.paused,
    immersive: state.immersive,
    setMode: state.setMode,
    toggleEffect: state.toggleEffect,
    actions: state.actions,
  });
}
