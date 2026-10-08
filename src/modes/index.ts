import { collect, report } from "../registry";
import { isMode } from "./types";
import type { ModeDef } from "./types";

export * from "./types";

// Every file in this folder except index.ts and types.ts is a mode.
// Helpers shared by several modes belong in src/vision or a subfolder.
// Plugin files import from "./types", never from this file: this file imports
// them, so a value imported back from here does not exist yet when they load.
const found = collect(
  import.meta.glob(["./*.ts", "!./index.ts", "!./types.ts"], { eager: true }),
  isMode,
  "mode",
);
report(found.problems);

export const modes: readonly ModeDef[] = found.items;
export const modeProblems: readonly string[] = found.problems;
export const defaultMode: ModeDef = modes[0];
/** Look a mode up by id; an unknown id falls back to the first mode. */
export const getMode = (id: string): ModeDef =>
  modes.find((mode) => mode.id === id) ?? defaultMode;
