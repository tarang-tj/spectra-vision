/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { Suspense, lazy } from "react";
import ErrorBoundary from "../../components/ErrorBoundary";
import type { TaskSpec } from "../../vision/types";
import FinerSetting from "./finer-setting";
import ObjectModelSetting from "./object-model-setting";
import ObjectSharperSetting from "./object-sharper-setting";

// Fetched when Objects' settings are first shown, so the first paint does not
// carry it. Until it arrives its place is empty; if it cannot be fetched or
// throws, only this setting says so and the others stay.
const ObjectMeasureSetting = lazy(() => import("./object-measure-setting"));

/** Objects' own settings in the Inspect panel: which model runs on a GPU,
 * the Sharper model where it can run, Finer names, then Measure objects. */
export const objectControls = (spec: TaskSpec) =>
  function ObjectControls() {
    return (
      <>
        <ObjectModelSetting spec={spec} />
        <ObjectSharperSetting spec={spec} />
        <FinerSetting />
        <ErrorBoundary name="The Measure objects setting">
          <Suspense fallback={null}>
            <ObjectMeasureSetting />
          </Suspense>
        </ErrorBoundary>
      </>
    );
  };
