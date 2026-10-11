/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// How often a still picture is inferred. A picture that does not change
// gives the same answer every time, so running the model on it 15 times a
// second only keeps a core busy. The rule (decided in useVision's frame tick):
//   - after a wake (a new picture, mode, setting, live option, delegate, or
//     resume) every task runs at its full rate for SETTLE_RESULTS results:
//     the gesture count wants 3 results in a row and a track wants 2;
//   - then each task is checked once every STILL_GAP_MS, or not at all for a
//     task whose spec says `still: "once"` (Depth);
//   - while something that measures over time is running (a hold: the Lab,
//     a Presence session) the full rate stays on, and the readout says why.
// A video or a camera is never paced here. Pure except for the two small
// stores at the bottom; no timer, no loop.

/** Results each task gets at its full rate after a wake. */
export const SETTLE_RESULTS = 4;
/** Then one inference per this many ms. */
export const STILL_GAP_MS = 1000;

export type StillPacer = {
  /** Something changed: run at the full rate again. */
  wake(): void;
  /** A result of task `index` arrived for the current picture. */
  counted(index: number): void;
  /** May task `index` be sent a frame at animation time `time`? */
  allows(index: number, time: number): boolean;
  /** A frame was sent to task `index` at `time`. */
  sent(index: number, time: number): void;
  /** True once every task has had its full-rate results. */
  settled(): boolean;
  /** Inferences a second per task once settled: 0 when every task is done
   * for good, else 1000 / STILL_GAP_MS. */
  rate(): number;
};

/** One pacer per mode on stage. `once[i]` is whether task i needs a single
 * result of a still picture and nothing after it. */
export function createStillPacer(once: boolean[]): StillPacer {
  const need = once.map((single) => (single ? 1 : SETTLE_RESULTS)),
    count = once.map(() => 0),
    last = once.map(() => -Infinity);
  return {
    wake() {
      count.fill(0);
      last.fill(-Infinity);
    },
    counted(index) {
      count[index]++;
    },
    allows(index, time) {
      if (count[index] < need[index]) return true;
      return !once[index] && time - last[index] >= STILL_GAP_MS;
    },
    sent(index, time) {
      last[index] = time;
    },
    settled: () => count.every((n, i) => n >= need[i]),
    rate: () => (once.every(Boolean) ? 0 : 1000 / STILL_GAP_MS),
  };
}

// Holds: whatever needs the model to keep running on a still picture.
const holds = new Set<() => string | null>();
/** Register a check that returns who needs continuous inference right now
 * ("the Lab"), or null. Asked once per frame tick, so it must be cheap.
 * Returns the function that removes it. */
export function addInferenceHold(check: () => string | null): () => void {
  holds.add(check);
  return () => void holds.delete(check);
}
/** Who is keeping inference on, or null. */
export function inferenceHeldBy(): string | null {
  for (const check of holds) {
    const who = check();
    if (who) return who;
  }
  return null;
}

/** What the frame-rate readout says about the source on stage.
 *  live      a video or camera, or nothing yet: the rate is the rate
 *  settling  a still picture in its full-rate run
 *  still     a still picture left alone: `perSecond` checks a second (0: none)
 *  held      a still picture kept at the full rate for `by` */
export type StillState =
  | { state: "live" | "settling" }
  | { state: "still"; perSecond: number }
  | { state: "held"; by: string };

const LIVE: StillState = { state: "live" };
let current: StillState = LIVE;
const watchers = new Set<() => void>();
export const stillState = () => current;
export const onStillState = (watcher: () => void) => {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
};
/** Set by useVision. The object is replaced only when something differs, so
 * it can be read with useSyncExternalStore. */
export function setStillState(next: StillState) {
  if (
    next.state === current.state &&
    (next.state !== "still" ||
      next.perSecond === (current as typeof next).perSecond) &&
    (next.state !== "held" || next.by === (current as typeof next).by)
  )
    return;
  current = next.state === "live" ? LIVE : next;
  for (const watcher of [...watchers]) watcher();
}

export type StillGate = StillPacer & {
  /** Once per frame tick. `image` is whether the source is a still picture;
   * `resting` is whether nothing can be sent (paused, or no source). Wakes
   * the pacer when the picture or the confidence changed or the stage came
   * back from a rest, and sets the readout state. Returns true when this
   * tick's frames are to be paced by `allows`. */
  tick(
    image: boolean,
    generation: number,
    confidence: number,
    resting: boolean,
  ): boolean;
};

/** The pacer as the frame tick uses it. */
export function createStillGate(once: boolean[]): StillGate {
  const pacer = createStillPacer(once);
  let seen = NaN,
    asked = NaN,
    rested = false;
  return {
    ...pacer,
    tick(image, generation, confidence, resting) {
      if (resting) {
        rested = true;
        setStillState(LIVE);
        return false;
      }
      if (rested || generation !== seen || confidence !== asked) pacer.wake();
      rested = false;
      seen = generation;
      asked = confidence;
      if (!image) {
        setStillState(LIVE);
        return false;
      }
      const by = inferenceHeldBy();
      setStillState(
        by
          ? { state: "held", by }
          : pacer.settled()
            ? { state: "still", perSecond: pacer.rate() }
            : { state: "settling" },
      );
      return !by;
    },
  };
}

/** The words for the readout: what replaces the rate, and a note under it.
 * Either can be empty. */
export function stillWords(s: StillState): { value: string; note: string } {
  if (s.state === "still")
    return {
      value: "still picture",
      note: s.perSecond
        ? `checked ${s.perSecond === 1 ? "once" : `${s.perSecond} times`} a second`
        : "inferred once",
    };
  if (s.state === "held")
    return { value: "", note: `kept running for ${s.by}` };
  return { value: "", note: "" };
}
