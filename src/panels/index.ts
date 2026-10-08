import { collect, report } from "../registry";
import { isPanel } from "./types";
import type { PanelDef } from "./types";

export * from "./types";

// Every .tsx file in this folder is a panel. Panel files import from
// "./types", never from this file (this file imports them). Components shared by panels
// belong in src/components or a subfolder, not here.
const found = collect(
  import.meta.glob("./*.tsx", { eager: true }),
  isPanel,
  "panel",
);
report(found.problems);

export const panels: readonly PanelDef[] = found.items;
export const panelProblems: readonly string[] = found.problems;
