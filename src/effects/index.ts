import { collect, report } from "../registry";
import { isEffect } from "./types";
import type { EffectDef } from "./types";

export * from "./types";

// Every file in this folder except index.ts and types.ts is an effect.
// Shared helpers belong in a subfolder (for example ./lib).
// Plugin files import from "./types", never from this file: this file imports
// them, so a value imported back from here does not exist yet when they load.
const found = collect(
  import.meta.glob(["./*.ts", "!./index.ts", "!./types.ts"], { eager: true }),
  isEffect,
  "effect",
);
report(found.problems);

export const effects: readonly EffectDef[] = found.items;
export const effectProblems: readonly string[] = found.problems;
export const effectsFor = (modeId: string): EffectDef[] =>
  effects.filter(
    (effect) => effect.modes === "*" || effect.modes.includes(modeId),
  );
