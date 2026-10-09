import { describe, it, expect } from "vitest";
import { Calibrator } from "../src/panels/presence/calibration";
import { recordSignals } from "../src/panels/presence/recording";
import { countStarts } from "../src/panels/presence/hand-events";
import { computeRows } from "../src/panels/presence/metrics";
import {
  DEFAULT_THRESHOLDS,
  emptyRecording,
  type FaceSample,
  type HandSample,
  type PoseSample,
  type Recording,
  type Signals,
} from "../src/panels/presence/types";

const W = 0.25; // shoulder distance in image-height units
const DT = 100;
const face = (t: number, yaw = 0, pitch = 0, change = NaN): FaceSample => ({
  t,
  yaw,
  pitch,
  change,
  nose: { x: 0.5, y: 0.4 },
});
const pose = (
  t: number,
  x = 0.5,
  motion = NaN,
  worldSpeed = NaN,
): PoseSample => ({
  t,
  x,
  width: W,
  motion,
  worldSpeed,
});
const hand = (t: number, ...speeds: number[]): HandSample => ({
  t,
  hands: speeds.map((speed, i) => ({ label: i ? "Right" : "Left", speed })),
});

/** Run signals through the calibrator, then record the measuring signals. */
function session(cal: Signals[], measure: Signals[]) {
  const c = new Calibrator();
  cal.forEach((s) => c.add(s));
  const base = c.finish(5000),
    rec: Recording = emptyRecording();
  // The store's own recording path, one result every DT after the first.
  measure.forEach((s, i) => recordSignals(rec, s, i ? DT : 0));
  return { base, rec };
}
const series = (n: number, make: (i: number, t: number) => Partial<Signals>) =>
  Array.from({ length: n }, (_, i) => ({ t: i * DT, ...make(i, i * DT) }));
const row = (rows: ReturnType<typeof computeRows>, id: string) =>
  rows.find((r) => r.id === id)!;

describe("a still figure", () => {
  // The signals jitter by +-0.001 height units: landmark noise, not movement.
  const jitter = (i: number) => (i % 2 ? 0.001 : -0.001);
  const make = (i: number) => ({
    pose: pose(i * DT, 0.5 + jitter(i), i ? 0.02 : NaN),
    face: face(i * DT, jitter(i), 0, i ? 0.01 : NaN),
  });
  const { base, rec } = session(series(50, make), series(100, make));
  const rows = computeRows(rec, base, DEFAULT_THRESHOLDS);

  it("has sway as small as the calibration noise and says so", () => {
    const sway = row(rows, "sway").measured!;
    expect(sway.value).toBeLessThan(0.02);
    expect(sway.error).toBeGreaterThan(0);
    expect(Math.abs(sway.value - sway.error)).toBeLessThan(0.002);
    expect(sway.unit).toBe("shoulder widths");
  });
  it("is still for the whole time", () => {
    expect(row(rows, "stillness").measured!.value).toBeCloseTo(100, 6);
  });
  it("faces the baseline for the whole time", () => {
    expect(row(rows, "head").measured!.value).toBeCloseTo(100, 6);
  });
  it("shows expression change equal to its own noise floor", () => {
    const e = row(rows, "expression").measured!;
    expect(e.value).toBeCloseTo(0.01, 9);
    expect(e.error).toBeCloseTo(0.01, 9);
  });
});

describe("sway", () => {
  it("gives the standard deviation of a known sinusoid, in shoulder widths", () => {
    // 0.5 shoulder widths of amplitude, 0.5 Hz, exactly 5 periods in 200 samples.
    const amp = 0.5 * W,
      at = (i: number) =>
        0.5 + amp * Math.sin(2 * Math.PI * 0.5 * ((i * 50) / 1000));
    const cal = series(30, (i) => ({
      pose: pose(i * DT, 0.5 + (i % 2 ? 0.0005 : -0.0005)),
    }));
    const meas = Array.from({ length: 200 }, (_, i) => ({
      t: i * 50,
      pose: pose(i * 50, at(i)),
    }));
    const { base, rec } = session(cal, meas);
    const sway = row(
      computeRows(rec, base, DEFAULT_THRESHOLDS),
      "sway",
    ).measured!;
    const expected = (0.5 / Math.SQRT2) * Math.sqrt(200 / 199);
    expect(sway.value).toBeCloseTo(expected, 3);
    expect(sway.error).toBeCloseTo((0.0005 / W) * Math.sqrt(30 / 29), 4);
  });
});

describe("head toward camera", () => {
  const cal = series(30, (i) => ({ face: face(i * DT, i % 2 ? 1 : -1) }));
  it("is about 50% for a head turned past the angle for half the time", () => {
    const meas = series(200, (i) => ({ face: face(i * DT, i < 100 ? 0 : 30) }));
    const { base, rec } = session(cal, meas);
    const head = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "head");
    expect(head.measured!.value).toBeGreaterThan(49);
    expect(head.measured!.value).toBeLessThan(51);
    expect(head.measured!.unit).toBe("%");
    // The error comes from moving the angle by the calibration noise (about 1 degree).
    expect(head.range![0]).toBeLessThanOrEqual(head.measured!.value);
    expect(head.range![1]).toBeGreaterThanOrEqual(head.measured!.value);
  });
  it("widens the range when the angle limit sits on the data", () => {
    // A head held 14.5 degrees away: inside 15, outside 15 - 1.
    const meas = series(50, (i) => ({ face: face(i * DT, 14.5) }));
    const { base, rec } = session(cal, meas);
    const head = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "head");
    expect(head.measured!.value).toBeCloseTo(100, 6);
    expect(head.range![0]).toBeCloseTo(0, 6);
    expect(head.measured!.error).toBeCloseTo(100, 6);
  });
  it("does not count time across a stage stop", () => {
    const meas = [
      { t: 0, face: face(0, 0) },
      { t: DT, face: face(DT, 0) },
      { t: 60_000, face: face(60_000, 40) },
      { t: 60_000 + DT, face: face(60_000 + DT, 40) },
    ];
    const { base, rec } = session(cal, meas);
    // 100 ms inside, 100 ms outside: the minute between them has no weight.
    expect(
      row(computeRows(rec, base, DEFAULT_THRESHOLDS), "head").measured!.value,
    ).toBeCloseTo(50, 6);
  });
  it("states its denominator when the face is lost for half the session", () => {
    // 30 s facing the camera, then 30 s in which the face model sees nothing.
    const meas = series(600, (i) => ({
      face: i < 300 ? face(i * DT, 0) : null,
    }));
    const { base, rec } = session(cal, meas);
    const head = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "head");
    expect(head.measured!.value).toBeCloseTo(100, 6);
    expect(head.denominator!.seenMs).toBeCloseTo(29_900, 6);
    expect(head.denominator!.coveredMs).toBeCloseTo(59_900, 6);
    expect(head.measured!.basis).toMatch(/29\.9 s of 59\.9 s a face was seen/);
    expect(head.measured!.error).toBeGreaterThan(0);
    // The seen share is a separate row and says the face was seen half the time.
    expect(
      row(computeRows(rec, base, DEFAULT_THRESHOLDS), "seen-face").measured!
        .value,
    ).toBeCloseTo(50, 6);
  });
  it("does not credit the time of a loss to the direction it ends in", () => {
    const meas: Signals[] = [
      { t: 0, face: face(0, 0) },
      { t: 100, face: face(100, 0) },
      ...Array.from({ length: 10 }, (_, i) => ({
        t: 200 + i * 100,
        face: null,
      })),
      { t: 1200, face: face(1200, 40) },
      { t: 1300, face: face(1300, 40) },
    ];
    const { base, rec } = session(cal, meas);
    // 100 ms inside, 100 ms outside; the 1.1 s of loss is credited to neither.
    expect(
      row(computeRows(rec, base, DEFAULT_THRESHOLDS), "head").measured!.value,
    ).toBeCloseTo(50, 6);
  });
  it("uses the true angle between directions, not the hypotenuse of yaw and pitch", () => {
    const exact = series(30, () => ({ face: face(0, 0, 0) }));
    const meas = series(50, (i) => ({ face: face(i * DT, 40, 40) }));
    const { base, rec } = session(exact, meas);
    // yaw 40 and pitch 40 are 54.07 degrees apart (the hypotenuse would say 56.6).
    const at = (headAngle: number) =>
      row(computeRows(rec, base, { ...DEFAULT_THRESHOLDS, headAngle }), "head")
        .measured!.value;
    expect(at(55)).toBeCloseTo(100, 6);
    expect(at(54)).toBeCloseTo(0, 6);
  });
});

describe("stillness when the body is lost", () => {
  it("is a share of the time the body was seen, with both times stated", () => {
    const calm = (i: number) =>
      pose(i * DT, 0.5 + (i % 2 ? 0.001 : -0.001), 0.02);
    const cal = series(30, (i) => ({ pose: calm(i) }));
    // 30 s still, then the person walks out of frame for 30 s.
    const meas = series(600, (i) => ({ pose: i < 300 ? calm(i) : null }));
    const { base, rec } = session(cal, meas);
    const still = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "stillness");
    expect(still.measured!.value).toBeCloseTo(100, 6);
    expect(still.denominator!.seenMs).toBeLessThan(30_000);
    expect(still.denominator!.coveredMs).toBeGreaterThan(59_000);
    expect(still.measured!.basis).toMatch(
      /Time the body was lost is not in the denominator/,
    );
    expect(still.measured!.error).toBeGreaterThan(0);
  });
});

describe("hand movement starts", () => {
  const at = (speeds: number[], thr = 0.5, still = 300) =>
    countStarts(
      speeds.map((speed, i) => ({ t: i * DT, speed })),
      thr,
      still,
    );
  const slow = 0.1,
    fast = 1;
  it("counts exactly the starts that follow enough stillness", () => {
    const path = [
      NaN, // hand just came into view: not a start
      ...Array(4).fill(slow),
      fast,
      fast, // start 1 (400 ms still)
      ...Array(3).fill(slow),
      fast, // start 2 (300 ms still, exactly enough)
      ...Array(2).fill(slow),
      fast, // not enough still (200 ms)
      ...Array(4).fill(slow),
      fast, // start 3
    ];
    expect(at(path)).toBe(3);
  });
  it("does not count a hand that appears already moving, or a long fast stretch twice", () => {
    expect(at([NaN, fast, fast, fast, fast])).toBe(0);
    expect(at([NaN, slow, slow, slow, slow, fast, fast, fast, fast])).toBe(1);
  });
  it("restarts the still timer after a gap", () => {
    const samples = [
      { t: 0, speed: NaN },
      { t: 100, speed: slow },
      { t: 200, speed: slow },
      { t: 300, speed: slow },
      { t: 400, speed: slow },
      { t: 100_000, speed: fast },
    ];
    expect(countStarts(samples, 0.5, 300)).toBe(0);
  });
  it("reports events per minute with a range from the threshold noise", () => {
    // Speeds alternate between still and fast bursts every 0.5 s for 10 s.
    const burst = (i: number) => (i % 10 < 5 ? 0.02 : 0.55) * W;
    const cal = series(30, (i) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, i ? (i % 2 ? 0.01 : 0.03) * W : NaN),
    }));
    const meas = series(100, (i) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, i ? burst(i) : NaN),
    }));
    const { base, rec } = session(cal, meas);
    const moves = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "hand-moves");
    // 10 s covered (99 steps of 100 ms), one start every second.
    expect(moves.measured!.value).toBeGreaterThan(5);
    expect(moves.measured!.unit).toBe("per min");
    expect(moves.measured!.error).toBeGreaterThanOrEqual(0);
    expect(
      row(computeRows(rec, base, DEFAULT_THRESHOLDS), "hand-view-left")
        .measured!.value,
    ).toBeCloseTo(100, 6);
  });
});

describe("counts never read as exact", () => {
  it("floors the error at one start and shows the raw count and time", () => {
    const cal = series(30, (i) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, i ? (i % 2 ? 0.01 : 0.03) * W : NaN),
    }));
    // One clear start in 3 s: still, then a fast burst.
    const meas = series(30, (i) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, i === 0 ? NaN : i < 15 ? 0.02 * W : 3 * W),
    }));
    const { base, rec } = session(cal, meas);
    const moves = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "hand-moves");
    expect(moves.detail).toBe("1 start in 2.9 s");
    expect(moves.measured!.error).toBeGreaterThanOrEqual(60 / 2.9 - 1e-9);
  });
});

describe("range of a count that is not monotone in its threshold", () => {
  it("still contains the nominal value", () => {
    // A hand always a little over the threshold has no starts; with the threshold
    // raised by the noise it counts as still, and each burst becomes a start.
    const cal = series(30, (i) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, i ? (i % 2 ? 0.1 : 0.5) * W : NaN),
    }));
    const meas = series(100, (i) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, i ? (i % 6 === 0 ? 1.5 : 0.55) * W : NaN),
    }));
    const { base, rec } = session(cal, meas);
    const moves = computeRows(rec, base, DEFAULT_THRESHOLDS).find(
      (r) => r.id === "hand-moves",
    )!;
    expect(moves.measured!.value).toBe(0);
    expect(moves.range![1]).toBeGreaterThan(0);
    expect(moves.range![0]).toBeLessThanOrEqual(moves.measured!.value);
    expect(moves.measured!.error).toBeCloseTo(moves.range![1], 9);
  });
});

describe("inputs that were not seen", () => {
  it("say not seen, never zero, when nothing was recorded", () => {
    const { base, rec } = session([], []);
    const rows = computeRows(rec, base, DEFAULT_THRESHOLDS);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(r.measured, r.id).toBeNull();
      expect(r.reason, r.id).toBeTruthy();
    }
  });
  it("only the body seen: head, expression and hands are not seen, sway is measured", () => {
    const make = (i: number) => ({
      pose: pose(i * DT, 0.5 + (i % 2 ? 0.001 : -0.001), 0.02),
    });
    const { base, rec } = session(series(40, make), series(40, make));
    const rows = computeRows(rec, base, DEFAULT_THRESHOLDS);
    for (const id of [
      "head",
      "expression",
      "hand-moves",
      "hand-view-left",
      "seen-face",
      "seen-hand",
    ])
      expect(row(rows, id).measured, id).toBeNull();
    expect(row(rows, "sway").measured).not.toBeNull();
    expect(row(rows, "seen-pose").measured!.value).toBe(100);
  });
  it("a face seen only while measuring has no baseline, so it is not seen with the reason", () => {
    const { base, rec } = session(
      series(40, (i) => ({ pose: pose(i * DT) })),
      series(40, (i) => ({ face: face(i * DT, 3) })),
    );
    const head = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "head");
    expect(head.measured).toBeNull();
    expect(head.reason).toMatch(/calibration/);
  });
  it("hands not in view in calibration give no hand-speed error, so no events figure", () => {
    const { base, rec } = session(
      series(40, (i) => ({
        pose: pose(i * DT),
        hand: { t: i * DT, hands: [] },
      })),
      series(40, (i) => ({ pose: pose(i * DT), hand: hand(i * DT, 0.1) })),
    );
    const moves = row(computeRows(rec, base, DEFAULT_THRESHOLDS), "hand-moves");
    expect(moves.measured).toBeNull();
    expect(moves.reason).toMatch(/noise floor/);
  });
  it("a hand seen only on one side leaves the other side not seen", () => {
    const make = (i: number) => ({
      pose: pose(i * DT),
      hand: hand(i * DT, 0.01),
    });
    const { base, rec } = session(series(40, make), series(40, make));
    const rows = computeRows(rec, base, DEFAULT_THRESHOLDS);
    expect(row(rows, "hand-view-left").measured).not.toBeNull();
    expect(row(rows, "hand-view-right").measured).toBeNull();
  });
});

describe("world speed", () => {
  it("is a second row only when world landmarks were present", () => {
    const make = (world: number) => (i: number) => ({
      pose: pose(i * DT, 0.5, 0.02, i ? world : NaN),
    });
    const withWorld = session(series(40, make(0.1)), series(40, make(0.4)));
    const rows = computeRows(withWorld.rec, withWorld.base, DEFAULT_THRESHOLDS);
    expect(row(rows, "wrist-world").measured!.unit).toBe("m/s");
    expect(row(rows, "wrist-world").measured!.value).toBeCloseTo(0.4, 9);
    const without = session(series(40, make(NaN)), series(40, make(NaN)));
    expect(
      computeRows(without.rec, without.base, DEFAULT_THRESHOLDS).some(
        (r) => r.id === "wrist-world",
      ),
    ).toBe(false);
  });
});
