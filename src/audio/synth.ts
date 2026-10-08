/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// A tiny WebAudio synthesizer for the games. Every sound is generated: there
// are no audio files. It makes no AudioContext until the page has had a user
// gesture, and every call is safe (silent) when audio is unavailable.

export type ToneSpec = {
  type?: OscillatorType;
  /** Start and end frequency in Hz (a glide when they differ). */
  from: number;
  to?: number;
  /** Seconds. */
  duration: number;
  gain?: number;
  /** Seconds from now. */
  delay?: number;
};
export type SynthStats = {
  context: "none" | AudioContextState;
  muted: boolean;
  /** One-shot sounds actually scheduled since this synth was made. */
  played: number;
  /** Source nodes started and not yet ended. */
  live: number;
  voices: number;
};
/** A sustained instrument: a saw wave through a low-pass filter. */
export type Voice = {
  /** Sound this pitch now. Call it every frame while the note should hold:
   * a voice that is not refreshed fades out by itself within a moment, so a
   * paused stage or a hidden tab can never leave a note droning. */
  set(hz: number, cutoff: number, level: number): void;
  rest(): void;
};
export type Synth = {
  tone(spec: ToneSpec): void;
  noise(duration: number, gain: number, cutoff: number): void;
  voice(): Voice;
  stats(): SynthStats;
  dispose(): void;
};

let gesture = false;
let muted = false;
const masters = new Set<(value: boolean) => void>();

/** Record that the user has interacted with the page. */
export function noteGesture() {
  gesture = true;
}
if (typeof window !== "undefined") {
  const once = { capture: true, once: true, passive: true };
  window.addEventListener("pointerdown", noteGesture, once);
  window.addEventListener("keydown", noteGesture, once);
}
const gestureSeen = () =>
  gesture ||
  (typeof navigator !== "undefined" &&
    navigator.userActivation?.hasBeenActive === true);

export const isMuted = () => muted;
/** Mute or unmute every game sound. Kept for the whole visit. */
export function setMuted(value: boolean) {
  muted = value;
  for (const apply of masters) apply(value);
}

export function createSynth(): Synth {
  let ctx: AudioContext | null = null,
    master: GainNode | null = null,
    hiss: AudioBuffer | null = null,
    dead = false,
    played = 0,
    live = 0;
  const voices: { stop(): void }[] = [];
  const applyMute = (value: boolean) => {
    if (ctx && master)
      master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.01);
  };
  // The context is made on the first sound after a gesture, never before.
  const ready = () => {
    if (ctx || dead || !gestureSeen()) return ctx;
    try {
      const Ctor = globalThis.AudioContext;
      if (!Ctor) throw new Error("WebAudio is unavailable");
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      masters.add(applyMute);
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    } catch {
      // No audio on this device: the games stay playable in silence.
      dead = true;
      ctx = null;
    }
    return ctx;
  };
  const start = (node: AudioScheduledSourceNode, at: number, end?: number) => {
    live++;
    node.onended = () => {
      live = Math.max(0, live - 1);
      node.disconnect();
    };
    node.start(at);
    if (end !== undefined) node.stop(end);
  };
  return {
    tone(spec) {
      const audio = ready();
      if (!audio || !master) return;
      try {
        const at = audio.currentTime + (spec.delay ?? 0),
          end = at + spec.duration,
          osc = audio.createOscillator(),
          gain = audio.createGain();
        osc.type = spec.type ?? "sine";
        osc.frequency.setValueAtTime(spec.from, at);
        if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, end);
        // A fast attack and an exponential tail: a pluck, with no click.
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(spec.gain ?? 0.3, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(master);
        start(osc, at, end + 0.02);
        played++;
      } catch {
        // One failed sound is not worth stopping a round for.
      }
    },
    noise(duration, level, cutoff) {
      const audio = ready();
      if (!audio || !master) return;
      try {
        if (!hiss) {
          hiss = audio.createBuffer(1, audio.sampleRate / 2, audio.sampleRate);
          const data = hiss.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        const at = audio.currentTime,
          source = audio.createBufferSource(),
          filter = audio.createBiquadFilter(),
          gain = audio.createGain();
        source.buffer = hiss;
        filter.type = "lowpass";
        filter.frequency.value = cutoff;
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        source.connect(filter).connect(gain).connect(master);
        start(source, at, at + duration + 0.02);
        played++;
      } catch {
        // As above.
      }
    },
    voice() {
      let osc: OscillatorNode | null = null,
        filter: BiquadFilterNode | null = null,
        gain: GainNode | null = null;
      const stop = () => {
        try {
          osc?.stop();
        } catch {
          // Already stopped.
        }
        osc = filter = gain = null;
      };
      voices.push({ stop });
      return {
        set(hz, cutoff, level) {
          const audio = ready();
          if (!audio || !master) return;
          try {
            if (!osc) {
              osc = audio.createOscillator();
              filter = audio.createBiquadFilter();
              gain = audio.createGain();
              osc.type = "sawtooth";
              filter.type = "lowpass";
              filter.Q.value = 6;
              gain.gain.value = 0;
              osc.connect(filter).connect(gain).connect(master);
              start(osc, audio.currentTime);
            }
            const t = audio.currentTime;
            osc.frequency.setTargetAtTime(hz, t, 0.02);
            filter?.frequency.setTargetAtTime(cutoff, t, 0.04);
            gain?.gain.cancelScheduledValues(t);
            gain?.gain.setTargetAtTime(level, t, 0.03);
            // The keep-alive: silence follows unless set() is called again.
            gain?.gain.setTargetAtTime(0, t + 0.25, 0.08);
          } catch {
            stop();
          }
        },
        rest() {
          if (!ctx || !gain) return;
          try {
            gain.gain.cancelScheduledValues(ctx.currentTime);
            gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          } catch {
            stop();
          }
        },
      };
    },
    stats: () => ({
      context: ctx?.state ?? "none",
      muted,
      played,
      live,
      voices: voices.length,
    }),
    dispose() {
      dead = true;
      for (const voice of voices) voice.stop();
      voices.length = 0;
      masters.delete(applyMute);
      void ctx?.close().catch(() => {});
      ctx = master = hiss = null;
      live = 0;
    },
  };
}
