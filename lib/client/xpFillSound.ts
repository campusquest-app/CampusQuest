import { isGameMusicMuted } from "@/lib/playGameSound";

let audioCtx: AudioContext | null = null;
let fillOsc: OscillatorNode | null = null;
let fillGain: GainNode | null = null;
let fillPulseTimer: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function isMuted(): boolean {
  return isGameMusicMuted();
}

/** Soft rising magical tone while XP bar/ring fills. */
export function playXpFillSound(): void {
  if (isMuted()) return;
  stopXpFillSound();

  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume();

  fillGain = ctx.createGain();
  fillGain.gain.value = 0.0001;
  fillGain.connect(ctx.destination);

  fillOsc = ctx.createOscillator();
  fillOsc.type = "sine";
  fillOsc.frequency.value = 280;
  fillOsc.connect(fillGain);
  fillOsc.start();

  const now = ctx.currentTime;
  fillGain.gain.exponentialRampToValueAtTime(0.028, now + 0.35);

  let freq = 280;
  fillPulseTimer = setInterval(() => {
    if (!fillOsc || !ctx) return;
    freq = Math.min(620, freq + 6);
    fillOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.12);
  }, 140);
}

/** Fade out fill loop. */
export function stopXpFillSound(): void {
  if (fillPulseTimer != null) {
    clearInterval(fillPulseTimer);
    fillPulseTimer = null;
  }
  const ctx = audioCtx;
  if (fillGain && fillOsc && ctx) {
    const t = ctx.currentTime;
    try {
      fillGain.gain.cancelScheduledValues(t);
      fillGain.gain.setValueAtTime(Math.max(fillGain.gain.value, 0.0001), t);
      fillGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      fillOsc.stop(t + 0.24);
    } catch {
      try {
        fillOsc.stop();
      } catch {
        /* already stopped */
      }
    }
  }
  fillOsc = null;
  fillGain = null;
}

/** Short completion chime when fill + highlight finish. */
export function playXpCompleteSound(): void {
  if (isMuted()) return;
  stopXpFillSound();

  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume();

  const playNote = (frequency: number, startOffset: number, duration: number, gain = 0.045) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime + startOffset;
    osc.start(t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration / 1000);
    osc.stop(t0 + duration / 1000 + 0.05);
  };

  playNote(523, 0, 90);
  playNote(659, 0.08, 110, 0.04);
  playNote(784, 0.16, 140, 0.035);
}
