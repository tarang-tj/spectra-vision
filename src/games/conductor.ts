/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Conductor: each hand plays a synthesized instrument. Hand height picks a
// note of the scale, the thumb-to-index pinch opens and closes the filter,
// and a fast downward flick hits a drum. Follow the melody on the staff to
// score. Played in Hands mode. The rules are in lib/music-logic.ts.
import { pinchRatio } from "../vision/geometry";
import { createGame } from "./lib/game-shell";
import type { Core, Kit } from "./lib/game-shell";
import { INK, ROSE } from "./lib/hud";
import * as music from "./lib/music-logic";
import { bonus, hit, miss } from "./lib/round";
import { drawStaff, OPEN } from "./lib/staff-draw";
import type { Played, StaffView } from "./lib/staff-draw";
import type { GameDef } from "./types";

const PALM = 9;
const NOTE_POINTS = 100;
const DRUM_POINTS = 25;
const HISTORY = 32;

function core({ round, sfx, synth, popups, rng }: Kit): Core {
  const hands = [0, 1].map(() => ({
      lane: -1,
      /** Round time at which the hand arrived on its row. */
      since: 0,
      x: 0,
      y: 0,
      time: 0,
      cutoff: 2000,
      flick: music.createFlick(),
      voice: synth.voice(),
      /** Index in `played` of the note this hand is holding, or -1. */
      open: -1,
    })),
    present = [false, false],
    resolved = music.createResolved(),
    played: Played[] = Array.from({ length: HISTORY }, () => ({
      lane: 0,
      from: -1e9,
      to: -1e9,
      hand: 0,
    })),
    view: StaffView = {
      targets: [],
      cursor: 0,
      played,
      lanes: [-1, -1],
      cutoffs: [2000, 2000],
      clock: 0,
      drumAge: 1e9,
    },
    lanes = view.lanes as number[],
    cutoffs = view.cutoffs as number[];
  let stamp = -1,
    nextPlayed = 0,
    drums = 0;
  const quiet = () => hands.forEach((hand) => hand.voice.rest());
  // Close the bar a hand was drawing on the staff and start the next one.
  const mark = (hand: number, lane: number, clock: number) => {
    const state = hands[hand];
    if (state.open >= 0 && played[state.open].hand === hand)
      played[state.open].to = clock;
    state.open = -1;
    if (lane < 0 || round.phase !== "playing") return;
    const note = played[nextPlayed];
    state.open = nextPlayed;
    nextPlayed = (nextPlayed + 1) % HISTORY;
    note.lane = lane;
    note.from = clock;
    note.to = OPEN;
    note.hand = hand;
  };
  return {
    kind: "hand",
    howTo: "Raise a hand to the glowing note. Flick down for a drum",
    start() {
      view.targets = music.makeMelody(rng, round.roundMs);
      resolved.cursor = 0;
      resolved.hitAt = -1;
      for (const note of played) note.from = note.to = -1e9;
      for (const hand of hands) {
        hand.lane = hand.open = -1;
        hand.since = 0;
      }
      stamp = -1;
      drums = 0;
      view.drumAge = 1e9;
    },
    step(input, frame, dt) {
      const playing = round.phase === "playing",
        clock = playing ? round.clock : 0;
      view.clock = clock;
      view.drumAge += dt;
      if (input.time !== stamp) {
        stamp = input.time;
        present[0] = present[1] = false;
        for (let i = 0; i < Math.min(2, input.landmarks.length); i++) {
          const points = input.landmarks[i],
            palm = points[PALM];
          if (!palm) continue;
          // A stable slot per hand: by the model's handedness, else by order.
          let slot = input.handedness[i] === "Right" ? 1 : 0;
          if (present[slot]) slot = 1 - slot;
          present[slot] = true;
          const hand = hands[slot],
            seconds = (input.time - hand.time) / 1000,
            lane = music.quantizeLane(palm.y, hand.lane);
          if (hand.lane >= 0 && seconds > 0 && seconds < 0.5) {
            const vx = ((palm.x - hand.x) * frame.aspect) / seconds,
              vy = (palm.y - hand.y) / seconds;
            if (music.flickStep(hand.flick, vx, vy, input.time) && playing) {
              const points = bonus(round, DRUM_POINTS);
              drums++;
              view.drumAge = 0;
              sfx.drum();
              popups.pop(
                `DRUM +${points}`,
                frame.width / 2,
                frame.height - 120,
                INK,
              );
            }
          }
          if (lane !== hand.lane || hand.open < 0) {
            if (lane !== hand.lane) hand.since = clock;
            mark(slot, lane, clock);
          }
          hand.lane = lane;
          hand.x = palm.x;
          hand.y = palm.y;
          hand.time = input.time;
          hand.cutoff = music.pinchToCutoff(pinchRatio(points, frame.aspect));
        }
        for (let slot = 0; slot < 2; slot++) {
          if (present[slot] || hands[slot].lane < 0) continue;
          mark(slot, -1, clock);
          hands[slot].lane = -1;
          hands[slot].voice.rest();
        }
      }
      for (let slot = 0; slot < 2; slot++) {
        const hand = hands[slot];
        lanes[slot] = hand.lane;
        cutoffs[slot] = hand.cutoff;
        // Refreshed every running frame; it fades by itself when frames stop.
        if (playing && hand.lane >= 0)
          hand.voice.set(
            music.midiToHz(music.laneMidi(hand.lane)),
            hand.cutoff,
            0.16,
          );
      }
      if (!playing) return;
      music.resolveTargets(
        view.targets,
        clock,
        hands[0].lane,
        hands[0].since,
        hands[1].lane,
        hands[1].since,
        resolved,
      );
      view.cursor = resolved.cursor;
      const x = frame.rect.x + frame.rect.w * 0.3;
      for (let i = 0; i < resolved.hits; i++) {
        const points = hit(round, NOTE_POINTS);
        popups.pop(`+${points}`, x, frame.height / 2, INK);
        sfx.hit(round.combo);
      }
      for (let i = 0; i < resolved.misses; i++) {
        miss(round);
        popups.pop("MISS", x, frame.height / 2, ROSE);
        sfx.miss();
      }
    },
    draw(ctx, frame) {
      drawStaff(ctx, frame, view, round.phase === "playing");
    },
    pointers(input, out) {
      const count = Math.min(2, input.landmarks.length);
      for (let i = 0; i < count; i++) {
        out[i * 2] = input.landmarks[i][PALM]?.x ?? 0;
        out[i * 2 + 1] = input.landmarks[i][PALM]?.y ?? 0;
      }
      return count;
    },
    hint: (input) =>
      input.landmarks.length ? null : "Raise a hand: its height picks the note",
    rows: () => [
      ["Notes hit", String(round.hits)],
      ["Missed", String(round.misses)],
      ["Drum hits", String(drums)],
      ["Best combo", String(round.bestCombo)],
    ],
    snapshot: () => ({
      /** Row each hand is on, -1 for none. */
      lanes: [hands[0].lane, hands[1].lane],
      cutoffs: [hands[0].cutoff, hands[1].cutoff],
      drums,
      clock: view.clock,
      // The next note to hit and the image height that plays it.
      next: view.targets[resolved.cursor]
        ? {
            lane: view.targets[resolved.cursor].lane,
            at: view.targets[resolved.cursor].at,
            y: music.laneCentre(view.targets[resolved.cursor].lane),
          }
        : null,
    }),
    quiet,
  };
}

const conductor: GameDef = {
  id: "conductor",
  label: "Conductor",
  requires: "hands",
  order: 30,
  create: (env) => createGame("conductor", "Conductor", env, core),
};
export default conductor;
