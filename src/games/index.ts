import { collect, report } from "../registry";
import { isGame } from "./types";
import type { GameDef } from "./types";

export * from "./types";

// Every file in this folder except index.ts and types.ts is a game.
// Shared helpers belong in a subfolder (for example ./lib).
// Plugin files import from "./types", never from this file: this file imports
// them, so a value imported back from here does not exist yet when they load.
const found = collect(
  import.meta.glob(["./*.ts", "!./index.ts", "!./types.ts"], { eager: true }),
  isGame,
  "game",
);
report(found.problems);

export const games: readonly GameDef[] = found.items;
export const gameProblems: readonly string[] = found.problems;
export const getGame = (id: string | null): GameDef | null =>
  games.find((game) => game.id === id) ?? null;
