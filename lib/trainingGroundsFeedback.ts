import { isGameMusicMuted } from "@/lib/playGameSound";

function beep(frequency: number, durationMs: number, gain = 0.06): void {
  if (isGameMusicMuted()) return;
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.04);
    window.setTimeout(() => void ctx.close(), durationMs + 80);
  } catch {
    // Ignore audio failures on mobile Safari gesture rules.
  }
}

export function playTrainingCardTap(): void {
  beep(420, 35, 0.045);
}

export function playTrainingBegin(): void {
  beep(330, 50, 0.05);
  window.setTimeout(() => beep(494, 70, 0.055), 60);
}

export function playTrainingSuccess(): void {
  beep(660, 55, 0.055);
  window.setTimeout(() => beep(880, 80, 0.05), 75);
}

export function vibrateTrainingComplete(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(12);
  }
}
