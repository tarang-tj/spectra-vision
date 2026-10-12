/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { TaskSpec } from "../../vision/types";
import FinerSetting from "./finer-setting";
import ObjectModelSetting from "./object-model-setting";
import ObjectSharperSetting from "./object-sharper-setting";

/** Objects' own settings in the Inspect panel: which model runs on a GPU,
 * the Sharper model where it can run, then Finer names. */
export const objectControls = (spec: TaskSpec) =>
  function ObjectControls() {
    return (
      <>
        <ObjectModelSetting spec={spec} />
        <ObjectSharperSetting spec={spec} />
        <FinerSetting />
      </>
    );
  };
