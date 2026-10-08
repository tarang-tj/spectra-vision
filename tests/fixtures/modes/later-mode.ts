import type { ModeDef } from "../../../src/modes";

// Registry fixture: sorts after sample-mode because of its order.
const later: ModeDef = {
  id: "later-mode",
  label: "Later mode",
  short: "Later",
  order: 50,
  task: { kind: "object", model: "o.tflite", options: {}, delegate: "CPU" },
  hint: "A fixture.",
  demo: { still: "demo/studio.png", label: "Demo studio" },
  drawBase() {},
  inspector: () => [],
};
export default later;
