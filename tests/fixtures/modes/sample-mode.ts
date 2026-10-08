import type { ModeDef } from "../../../src/modes";

// Registry fixture: the smallest valid mode. It is discovered only by tests.
const sample: ModeDef = {
  id: "sample-mode",
  label: "Sample mode",
  short: "Sample",
  order: 5,
  task: [
    { kind: "pose", model: "pose.task", options: {}, delegate: "GPU" },
    { kind: "hand", model: "hand.task", options: {}, delegate: "CPU" },
  ],
  hint: "A fixture.",
  demo: { still: "demo/studio.png", label: "Demo studio" },
  drawBase() {},
  inspector: () => [],
};
export default sample;
