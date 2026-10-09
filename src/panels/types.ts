import type { ComponentType } from "react";
import { isRecord } from "../registry";
import type { Studio } from "../studio-context";

export type PanelDef = {
  id: string;
  /** Tab text. */
  label: string;
  order: number;
  /** Optional short marker beside the tab text, for example "Beta". Shown to
   * the eye only: the panel's own heading must say it too. */
  tag?: string;
  /** Takes no props: read and change app state through useStudio(). */
  Component: ComponentType;
  /** Optional: hide the tab while it has nothing to show. */
  visible?(studio: Studio): boolean;
};

export function isPanel(value: unknown): value is PanelDef {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.order === "number" &&
    typeof value.Component === "function"
  );
}
