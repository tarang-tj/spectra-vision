/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls tool: a room's shell from one frozen picture with the reference
// on the floor. Floor corners, ceiling heights, areas and volume with bars,
// a 3D preview and an OBJ and CSV export.
import type { RulerExtension } from "../extension-types";
import { drawWalls } from "./overlay";
import { wallsPointer } from "./pointer";
import WallsSection from "./section";
import { undoWalls } from "./store";
import "./walls.css";

// The Ruler works this line out only when its own state changes, so it stays
// general; the Walls section carries the live instruction.
const step = (): string =>
  "Walls: follow the steps in the Walls section below. Drag any point to adjust it.";

const walls: RulerExtension = {
  tool: "wall",
  label: "Walls",
  hint: "A room's floor, walls and ceiling height from one picture",
  step,
  draw: drawWalls,
  pointer: wallsPointer,
  undo: undoWalls,
  Section: WallsSection,
};
export default walls;
