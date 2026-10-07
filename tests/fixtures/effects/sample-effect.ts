import type { EffectDef } from "../../../src/effects";

// Registry fixture: an effect limited to one mode.
const sample: EffectDef = {
  id: "sample-effect",
  label: "Sample effect",
  modes: ["sample-mode"],
  kind: "gl",
  create: () => ({ draw() {}, dispose() {} }),
};
export default sample;
