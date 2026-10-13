/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { getMode, tasksOf } from "../../modes";
import { touchFirst } from "../../shell/device";
import { megabytes } from "../../vision/first-download";
import { probeWebgl } from "../../vision/webgl-probe";

/** What this browser says about the device, read once when the Lab opens.
 * Nothing here is measured, and the block says so. */
export function deviceRows(): [string, string][] {
  const probe = probeWebgl(),
    threads = navigator.hardwareConcurrency;
  return [
    ["Main pointer", touchFirst() ? "touch" : "mouse or trackpad"],
    [
      "Screen",
      `${innerWidth} x ${innerHeight} CSS px at ${Math.round(devicePixelRatio * 100) / 100}x`,
    ],
    [
      "Graphics",
      !probe?.webgl2
        ? "no WebGL2"
        : probe.renderer || "name withheld by the browser",
    ],
    ["WebGPU", "gpu" in navigator ? "offered" : "not offered"],
    ["Processor threads", threads ? String(threads) : "not reported"],
  ];
}

/** The Lab's first block: the device as the browser describes it, and which
 * Objects model the page starts on here and why (vision/model-choice.ts).
 * The measured figures stay in the blocks below, with their sample counts. */
export default function DeviceBlock() {
  const spec = tasksOf(getMode("objects"))[0],
    size = (file: string | undefined) =>
      megabytes(spec.sizes?.[file ?? ""] ?? 0),
    small = size(spec.model),
    large = size(spec.gpuModel);
  return (
    <section className="lab-block" data-testid="lab-device">
      <header>
        <h3>This device</h3>
      </header>
      <dl className="lab-card lab-device">
        {deviceRows().map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="lab-note" data-testid="lab-device-choice">
        {touchFirst()
          ? `Read from this browser, not measured. With nothing chosen, Objects starts on the ${small} model here because the main pointer is touch, which is how this page guesses at a phone or tablet. Nobody has timed the ${large} model on this device. To find out, switch on Larger model on a GPU in Inspect and read Object latency below.`
          : `Read from this browser, not measured. Objects starts on the ${large} model where a real graphics processor is found and on the ${small} one otherwise.`}
      </p>
    </section>
  );
}
