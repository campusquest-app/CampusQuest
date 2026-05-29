/** Lightweight Web Audio "blips" — no asset files. */

let sharedAudioContext: AudioContext | null = null;
const GAME_MUSIC_MUTED_KEY = "campusquest_game_music_muted";
const LEGACY_GAME_AUDIO_MUTED_KEY = "campusquest_game_audio_muted";

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      sharedAudioContext = new AudioContext();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export function isGameMusicMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(GAME_MUSIC_MUTED_KEY) === "1" ||
      window.localStorage.getItem(LEGACY_GAME_AUDIO_MUTED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setGameMusicMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (muted) window.localStorage.setItem(GAME_MUSIC_MUTED_KEY, "1");
    else window.localStorage.removeItem(GAME_MUSIC_MUTED_KEY);
    // Clear old shared-audio key so SFX are never accidentally muted by stale state.
    window.localStorage.removeItem(LEGACY_GAME_AUDIO_MUTED_KEY);
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

function beep(frequency: number, durationMs: number, type: OscillatorType = "sine", gain = 0.08): void {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(c.destination);
  osc.start();
  const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000);
  osc.stop(t + durationMs / 1000 + 0.05);
}

export function playXpDing(): void {
  beep(880, 60, "sine", 0.06);
  window.setTimeout(() => beep(1174, 45, "sine", 0.05), 70);
}

export function playLevelUpFanfare(): void {
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => {
    window.setTimeout(() => beep(f, 120, "triangle", 0.07), i * 95);
  });
}

export function playStreakWhoosh(): void {
  beep(220, 40, "sawtooth", 0.04);
  window.setTimeout(() => beep(440, 50, "sine", 0.05), 45);
}
