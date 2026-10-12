/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Lab tab. Its body (lab/panel.tsx) is fetched when the tab is first
// opened; the entry script carries only this definition.
import { lazyPanel } from "./shared/lazy-panel";
import type { PanelDef } from "./types";

const lab: PanelDef = {
  id: "lab",
  label: "Lab",
  order: 30,
  Component: lazyPanel("Lab", () => import("./lab/panel")),
};
export default lab;
