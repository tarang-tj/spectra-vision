/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the panel says about each picture of the room: whether it is on the
// plan, and in words why not. Pure.
import {
  IDENTITY,
  type AnchorCheck,
  type Placement,
  type Rigid,
} from "./room-frame";
import type { ViewFrame } from "./room-merge";

export type ViewStatus = {
  id: number;
  name: string;
  state:
    | "first"
    | "placed"
    | "provisional"
    | "refused"
    | "unanchored"
    | "no-reference";
  /** Its frame to the room's; null unless it is on the plan. */
  rigid: Rigid | null;
  text: string;
  checks: AnchorCheck[];
};
/** One line per picture, in strip order. `on` holds the pictures on the
 * plan with their turn; `result` what placing each of the others gave. */
export function statusOf(
  views: readonly { id: number; name: string; frame: ViewFrame | null }[],
  on: ReadonlyMap<number, Rigid>,
  result: ReadonlyMap<number, Placement>,
): ViewStatus[] {
  const first = views[0];
  return views.map((v, i): ViewStatus => {
    const p = result.get(v.id),
      rigid = on.get(v.id) ?? null;
    if (!v.frame)
      return {
        id: v.id,
        name: v.name,
        state: "no-reference",
        rigid: null,
        checks: [],
        text: `${v.name} has no reference yet. Tap its four corners in that picture.`,
      };
    if (i === 0)
      return {
        id: v.id,
        name: v.name,
        state: "first",
        rigid: IDENTITY,
        checks: [],
        text: `${v.name} sets the plan's frame: the plan is drawn as its reference reads.`,
      };
    if (!p)
      return {
        id: v.id,
        name: v.name,
        state: "unanchored",
        rigid: null,
        checks: [],
        text: `${v.name} is not on the plan yet: ${first.name} has no reference to set the plan's frame.`,
      };
    return {
      id: v.id,
      name: v.name,
      state: p.state,
      rigid: p.state === "placed" ? rigid : null,
      text: p.text,
      checks: p.checks,
    };
  });
}
