/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { TaskSpec } from "../../vision/types";
import FinerSetting from "./finer-setting";
import ObjectModelSetting from "./object-model-setting";

/** Objects' own settings in the Inspect panel: which model runs on a GPU,
 * then Finer names. */
export const objectControls = (spec: TaskSpec) =>
  function ObjectControls() {
    return (
      <>
        <ObjectModelSetting spec={spec} />
        <FinerSetting />
      </>
    );
  };
