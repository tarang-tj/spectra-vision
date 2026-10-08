/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { effectsFor } from "../effects";
import type { EffectDef } from "../effects";
import { tasksOf } from "../modes";
import type { ModeDef } from "../modes";
import type { TaskKind } from "../vision/types";

// A wildcard effect is offered in every mode, including modes whose model
// output it cannot draw. Trails follows object tracks, pose joints and hand
// pinches only, so its switch is hidden where none of those tasks runs.
// This table belongs with the effect (as a narrower `modes` list); it lives
// here because the v1 effect files are frozen for this wave.
const NEEDS_TASK: Record<string, readonly TaskKind[]> = {
  trails: ["object", "pose", "hand"],
};

/** The effects whose controls the tray shows for a mode: those registered for
 * it, minus any that would draw nothing with the tasks the mode runs. */
export function trayEffects(
  mode: ModeDef,
  registered: readonly EffectDef[] = effectsFor(mode.id),
): EffectDef[] {
  const kinds = tasksOf(mode).map((task) => task.kind);
  return registered.filter((effect) => {
    const needs = NEEDS_TASK[effect.id];
    return !needs || needs.some((kind) => kinds.includes(kind));
  });
}
