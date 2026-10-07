import type { GameDef } from "../../../src/games";

// Registry fixture: a game that needs the sample mode.
const sample: GameDef = {
  id: "sample-game",
  label: "Sample game",
  requires: "sample-mode",
  create: () => ({
    update() {},
    draw() {},
    state: () => ({ score: 0, status: "Ready" }),
    dispose() {},
  }),
};
export default sample;
