/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Library tab. Its body (library/panel.tsx) is fetched when the tab is
// first opened; the entry script carries only this definition.
// Imported here, not with the body: the Library counts what Objects saw
// while its tab is closed, so the counter listens from page load.
import "./library/seen";
import { lazyPanel } from "./shared/lazy-panel";
import type { PanelDef } from "./types";

const library: PanelDef = {
  id: "library",
  label: "Library",
  order: 35,
  Component: lazyPanel("Library", () => import("./library/panel")),
};
export default library;
