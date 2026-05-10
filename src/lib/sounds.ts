"use client";

export type SoundName = "flip" | "place" | "drop" | "win" | "lose" | "notify";

let context: AudioContext | null = null;
let muted = false;

if (typeof window !== "undefined") {
  muted = window.localStorage.getItem("game-hub-muted") === "1";
}

function audioContext() {
  if (typeof window === "undefined") return null;
  context ||= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function tone(frequency: number, start: number, duration: number, type: OscillatorType, gain: number) {
  const ctx = audioContext();
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

export function play(name: SoundName) {
  if (muted) return;
  if (name === "flip") tone(520, 0, 0.07, "triangle", 0.05);
  if (name === "place") {
    tone(340, 0, 0.08, "sine", 0.05);
    tone(460, 0.06, 0.07, "sine", 0.04);
  }
  if (name === "drop") tone(150, 0, 0.12, "sine", 0.08);
  if (name === "win") {
    tone(523, 0, 0.1, "triangle", 0.06);
    tone(659, 0.1, 0.1, "triangle", 0.06);
    tone(784, 0.2, 0.16, "triangle", 0.06);
  }
  if (name === "lose") {
    tone(330, 0, 0.12, "sawtooth", 0.04);
    tone(247, 0.12, 0.18, "sawtooth", 0.035);
  }
  if (name === "notify") {
    tone(740, 0, 0.07, "sine", 0.04);
    tone(980, 0.08, 0.08, "sine", 0.035);
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem("game-hub-muted", value ? "1" : "0");
  }
}
