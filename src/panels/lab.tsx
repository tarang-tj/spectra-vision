/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import BenchmarkPanel from "./lab/benchmark-panel";
import LiveCharts from "./lab/live-charts";
import { LoadTimes, ModelCards } from "./lab/model-cards";
import type { PanelDef } from "./types";
import "./lab/lab.css";

/** The performance lab: live charts, the delegate switch, a benchmark and the
 * model cards. Every number on it is measured in this browser. Nothing here
 * runs while another tab of the inspector is showing. */
function Lab() {
  return (
    <div className="lab-panel">
      <h2>Lab</h2>
      <p className="lab-note">
        Measured in this browser, on this device. Nothing is sent anywhere.
      </p>
      <LiveCharts />
      <LoadTimes />
      <BenchmarkPanel />
      <ModelCards />
    </div>
  );
}

const lab: PanelDef = {
  id: "lab",
  label: "Lab",
  order: 30,
  Component: Lab,
};
export default lab;
