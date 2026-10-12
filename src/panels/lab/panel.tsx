/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import BenchmarkPanel from "./benchmark-panel";
import LiveCharts from "./live-charts";
import { LoadTimes, ModelCards } from "./model-cards";
import Stability from "./stability";
import "./lab.css";

/** The performance lab: live charts, the delegate switch, a benchmark and the
 * model cards. Every number on it is measured in this browser. Nothing here
 * runs while another tab of the inspector is showing. */
export default function Lab() {
  return (
    <div className="lab-panel">
      <h2>Lab</h2>
      <p className="lab-note">
        Measured in this browser, on this device. Nothing is sent anywhere.
      </p>
      <LiveCharts />
      <Stability />
      <LoadTimes />
      <BenchmarkPanel />
      <ModelCards />
    </div>
  );
}
