import type { PanelDef } from "../../../src/panels";

// Registry fixture: a panel with a trivial component.
const sample: PanelDef = {
  id: "sample-panel",
  label: "Sample",
  order: 30,
  Component: () => <p>Sample panel</p>,
};
export default sample;
