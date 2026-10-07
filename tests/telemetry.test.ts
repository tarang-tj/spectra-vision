import { describe, it, expect, vi } from "vitest";
import { createBus } from "../src/telemetry/bus";

type Events = { tick: { n: number }; other: { label: string } };

describe("telemetry bus", () => {
  it("delivers each event only to listeners of its type", () => {
    const bus = createBus<Events>(),
      ticks: number[] = [],
      labels: string[] = [];
    bus.on("tick", (e) => ticks.push(e.n));
    bus.on("other", (e) => labels.push(e.label));
    bus.emit("tick", { n: 1 });
    bus.emit("tick", { n: 2 });
    bus.emit("other", { label: "a" });
    expect(ticks).toEqual([1, 2]);
    expect(labels).toEqual(["a"]);
  });
  it("stops delivering after unsubscribe and reports whether anyone listens", () => {
    const bus = createBus<Events>(),
      seen: number[] = [];
    expect(bus.listening("tick")).toBe(false);
    const off = bus.on("tick", (e) => seen.push(e.n));
    expect(bus.listening("tick")).toBe(true);
    expect(bus.listening("other")).toBe(false);
    bus.emit("tick", { n: 1 });
    off();
    bus.emit("tick", { n: 2 });
    expect(seen).toEqual([1]);
    expect(bus.listening("tick")).toBe(false);
  });
  it("keeps going when a listener throws", () => {
    const bus = createBus<Events>(),
      seen: number[] = [],
      error = vi.spyOn(console, "error").mockImplementation(() => {});
    bus.on("tick", () => {
      throw new Error("consumer bug");
    });
    bus.on("tick", (e) => seen.push(e.n));
    expect(() => bus.emit("tick", { n: 7 })).not.toThrow();
    expect(seen).toEqual([7]);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
