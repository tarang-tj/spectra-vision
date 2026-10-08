import { describe, it, expect } from "vitest";
import {
  measured,
  toJson,
  toMarkdown,
} from "../src/panels/lab/benchmark-report";
import type { BenchReport } from "../src/panels/lab/benchmark-report";
import { axisTop } from "../src/panels/lab/charts";

const report: BenchReport = {
  app: "SPECTRA",
  kind: "benchmark",
  schema: 1,
  startedAt: "2026-10-07T18:00:00.000Z",
  protocol: {
    measureMs: 20_000,
    warmupMs: 2_000,
    shortened: false,
    inferenceCapFps: 15.4,
    notes: "Fixed source.",
  },
  device: {
    userAgent: "TestAgent/1.0",
    browser: "Chrome 1.0",
    platform: "TestOS",
    cores: 8,
    memoryGb: null,
    gpu: "Test | GPU",
  },
  canvas: { width: 2190, height: 1368, dpr: 2 },
  rows: [
    {
      mode: "hands",
      modeLabel: "Hands",
      delegateRequested: "GPU",
      status: "ok",
      note: "",
      source: { kind: "demo", label: "Demo hands", width: 1536, height: 960 },
      measuredMs: 20_000,
      processedFps: 14.95,
      renderFps: 30,
      droppedFrames: 2,
      tasks: [
        {
          kind: "hand",
          model: "hand_landmarker.task",
          sha256: "ab".repeat(32),
          sha256Matches: true,
          delegateRequested: "GPU",
          delegateActive: "CPU",
          delegateNote: "GPU was requested but it failed. Running on CPU.",
          loadMs: 812.4,
          samples: 299,
          p50: 12.34,
          p95: 15.06,
          max: 31.9,
        },
      ],
    },
    {
      mode: "body",
      modeLabel: "Body",
      delegateRequested: "CPU",
      status: "failed",
      note: "Model did not load in 60 s",
      source: null,
      measuredMs: 20_000,
      processedFps: null,
      renderFps: null,
      droppedFrames: null,
      tasks: [],
    },
  ],
};

describe("benchmark exports", () => {
  it("writes JSON that reads back to the same report", () => {
    expect(JSON.parse(toJson(report))).toEqual(report);
  });
  it("stores a figure that was not measured as null, never as a number", () => {
    expect(measured(NaN)).toBeNull();
    expect(measured(Infinity)).toBeNull();
    expect(measured(0)).toBe(0);
    expect(measured(12.5)).toBe(12.5);
  });
  it("writes a Markdown summary with every reproducibility field", () => {
    const md = toMarkdown(report);
    expect(md).toContain("- Device: TestAgent/1.0");
    expect(md).toContain("- Browser: Chrome 1.0");
    expect(md).toContain("- GPU: Test | GPU");
    expect(md).toContain("- Canvas: 2190 x 1368 px (device pixel ratio 2)");
    expect(md).toContain("20 s measured after 2 s warm-up (excluded)");
    expect(md).not.toContain("SHORTENED");
    const line = md.split("\n").find((l) => l.startsWith("| Hands"))!;
    expect(line.split("|").map((c) => c.trim())).toEqual([
      "",
      "Hands",
      "hand",
      "hand_landmarker.task",
      "abababababab (matches record)",
      "GPU",
      "CPU",
      "299",
      "12.3",
      "15.1",
      "31.9",
      "14.9",
      "30.0",
      "2",
      "Demo hands 1536 x 960",
      "GPU was requested but it failed. Running on CPU.",
      "",
    ]);
    // Header, separator and data lines all have the same number of columns.
    const table = md.split("\n").filter((l) => l.startsWith("|"));
    expect(table).toHaveLength(4);
    expect(new Set(table.map((l) => l.split("|").length)).size).toBe(1);
    expect(table[3]).toContain("failed: Model did not load in 60 s");
  });
  it("labels a shortened run and unmeasured figures", () => {
    const short: BenchReport = {
      ...report,
      protocol: { ...report.protocol, measureMs: 1500, shortened: true },
      canvas: null,
      rows: [
        {
          ...report.rows[0],
          processedFps: null,
          tasks: [
            {
              ...report.rows[0].tasks[0],
              sha256: null,
              sha256Matches: null,
              p50: null,
            },
          ],
        },
      ],
    };
    const md = toMarkdown(short);
    expect(md).toContain("SHORTENED TEST RUN");
    expect(md).toContain("- Canvas: not measured");
    expect(md).toContain("| not hashed |");
    expect(md).toContain("| not measured |");
  });
});

describe("chart axis", () => {
  it("rounds up to 1, 2 or 5 times a power of ten", () => {
    expect(axisTop(0)).toBe(1);
    expect(axisTop(NaN)).toBe(1);
    expect(axisTop(0.7)).toBe(1);
    expect(axisTop(13)).toBe(20);
    expect(axisTop(20)).toBe(20);
    expect(axisTop(31)).toBe(50);
    expect(axisTop(51)).toBe(100);
  });
});
