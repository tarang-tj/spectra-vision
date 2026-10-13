/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Ruler tab. Its body (ruler/panel.tsx) is fetched when the tab is first
// opened; the entry script carries only this definition.
import { createElement, useEffect } from "react";
import { preferCamera } from "../vision/camera-choice";
import { lazyPanel } from "./shared/lazy-panel";
import type { PanelDef } from "./types";

const Body = lazyPanel("Ruler", () => import("./ruler/panel"));

function RulerTab() {
  // What gets measured is in front of the person, not behind the screen. Asked
  // here and not in the body, so it holds from the tab press, before the body
  // has arrived.
  useEffect(() => preferCamera("ruler", "environment"), []);
  return createElement(Body);
}

const ruler: PanelDef = {
  id: "ruler",
  label: "Ruler",
  order: 40,
  Component: RulerTab,
};
export default ruler;
