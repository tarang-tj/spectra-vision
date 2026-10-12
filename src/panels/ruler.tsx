/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Ruler tab. Its body (ruler/panel.tsx) is fetched when the tab is first
// opened; the entry script carries only this definition.
import { lazyPanel } from "./shared/lazy-panel";
import type { PanelDef } from "./types";

const ruler: PanelDef = {
  id: "ruler",
  label: "Ruler",
  order: 40,
  Component: lazyPanel("Ruler", () => import("./ruler/panel")),
};
export default ruler;
