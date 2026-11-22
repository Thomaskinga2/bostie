"use client";
// Game sounds, made in the browser with the Web Audio API: no audio files. Silent unless
// the player has turned sound on (store.sound).
import { useStore } from "./store";

type Sfx = "correct" | "wrong" | "jump" | "win" | "lose" | "tick" | "tap";
/** [frequency Hz, start s, length s] */
const TUNES: Record<Sfx, { wave: OscillatorType; notes: [number, number, number][] }> = {
  correct: { wave: "triangle", notes: [[660, 0, 0.09], [990, 0.09, 0.16]] },
  wrong: { wave: "sawtooth", notes: [[220, 0, 0.14], [160, 0.14, 0.22]] },
  jump: { wave: "square", notes: [[330, 0, 0.06], [520, 0.06, 0.1]] },
  win: { wave: "triangle", notes: [[523, 0, 0.11], [659, 0.11, 0.11], [784, 0.22, 0.11], [1047, 0.33, 0.28]] },
  lose: { wave: "sawtooth", notes: [[392, 0, 0.16], [311, 0.16, 0.16], [233, 0.32, 0.34]] },
  tick: { wave: "square", notes: [[880, 0, 0.04]] },
  tap: { wave: "triangle", notes: [[540, 0, 0.04]] },
};

let ctx: AudioContext | null = null;

export function sfx(name: Sfx) {
  if (typeof window === "undefined" || !useStore.getState().sound) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const { wave, notes } = TUNES[name];
    for (const [hz, at, len] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = hz;
      const t = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
  } catch {
    /* no audio on this device: the games are fully playable without it */
  }
}
