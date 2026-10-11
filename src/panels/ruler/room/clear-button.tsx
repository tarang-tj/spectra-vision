/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { clear, isEmpty, useRuler } from "../store";
import ConfirmButton from "./confirm-button";
import { stageView } from "./current";
import { useRoom } from "./store";
import { useViews } from "./views-store";

/** The Ruler's Clear button. On a picture of a room that has room points,
 * Clear takes away that picture's reference, and with it every room number
 * that rests on the picture, so it asks once more and says what goes. On any
 * other picture it is the plain button it always was. */
export default function ClearButton() {
  const s = useRuler(),
    room = useRoom(),
    { views } = useViews(),
    here = stageView(s.generation),
    n = here ? views.findIndex((v) => v.id === here.id) + 1 : 0;
  if (!here || !room.points.length)
    return (
      <button className="button" onClick={clear} disabled={isEmpty(s)}>
        Clear
      </button>
    );
  return (
    <ConfirmButton
      label="Clear"
      again={`Press again to clear picture ${n}: its reference and taps go, and the room's numbers that rest on it`}
      name={`Clear picture ${n}. Its reference and everything tapped on it are discarded, and the room's numbers that rest on it go until its reference is tapped again. Room points stay. Asks once more first.`}
      disabled={isEmpty(s)}
      onConfirm={clear}
    />
  );
}
