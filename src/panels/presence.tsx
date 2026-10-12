/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Presence tab. Its body (presence/panel.tsx) is fetched when the tab is
// first opened; the entry script carries only this definition. A session
// goes on while the tab is closed: its store stays in the entry script.
import { lazyPanel } from "./shared/lazy-panel";
import type { PanelDef } from "./types";

const presence: PanelDef = {
  id: "presence",
  label: "Presence",
  order: 50,
  Component: lazyPanel("Presence", () => import("./presence/panel")),
};
export default presence;
