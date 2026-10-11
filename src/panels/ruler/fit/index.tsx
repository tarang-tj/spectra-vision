/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Box tool: a box of real size stood on the floor of a frozen picture,
// drawn at true size, with a verdict on whether it fits that carries its bar.
import type { RulerExtension } from "../extension-types";
import { undoBox } from "./box-state";
import { drawBox } from "./draw";
import { onBoxPointer } from "./pointer";
import BoxSection from "./section";

const fit: RulerExtension = {
  tool: "box",
  label: "Box",
  hint: "Stand a box of real size on the floor and see whether it fits",
  step: () =>
    "Tap the floor to stand the box there. Drag the box to move it, or its corner handle to turn it.",
  draw: drawBox,
  pointer: onBoxPointer,
  undo: undoBox,
  Section: BoxSection,
};
export default fit;
