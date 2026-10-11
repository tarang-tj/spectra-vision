/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Room tool: one floor outline from corners seen in several pictures of
// the same room, each with the reference left where it lay.
import type { RulerExtension } from "../extension-types";
import { drawRoom } from "./overlay";
import { roomPointer } from "./pointer";
import RoomSection from "./room-section";
import { getState } from "../state";
import { stageView } from "./current";
import { undoRoom } from "./store";

// The Ruler works this line out only when its own state changes, so it stays
// general; the Room section carries the live instruction.
const step = (): string =>
  "Room: follow the steps in the Room section below. Drag any room point to adjust it.";

const room: RulerExtension = {
  tool: "room",
  label: "Room",
  hint: "One floor outline from corners in several pictures of a room",
  step,
  draw: drawRoom,
  pointer: roomPointer,
  undo: () => undoRoom(stageView(getState().generation)?.id ?? null),
  Section: RoomSection,
};
export default room;
