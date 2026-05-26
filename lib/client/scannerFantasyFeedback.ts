/**
 * Stubs / hooks for CQ Scanner audio & haptics (fantasy HUD on official CampusQuest sigils).
 * Wire real assets here later — callers stay unchanged.
 */

export type SigilVibrateStyle = "light" | "medium" | "heavy" | "success";

/** Optional ambient loop handle (future: AudioContext / HTMLAudioElement). */
export type FantasyAudioHandle = { stop: () => void };

/** Start looping arcane ambience — no-op until audio is added. */
export function startSigilAmbientHum(): FantasyAudioHandle {
  return {
    stop: () => {},
  };
}

/** Short lock tone when a sigil resolves (validated payload). No-op stub. */
export function playSigilScanLock(): void {}

/** Burst when XP is bestowed. No-op stub. */
export function playSigilXpBurst(): void {}

/** Level-up stinger when the realm elevates the adventurer. No-op stub. */
export function playSigilLevelUp(): void {}

function vibrateIfSupported(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function vibrateSigil(style: SigilVibrateStyle = "light"): void {
  switch (style) {
    case "heavy":
      vibrateIfSupported([28, 12, 18]);
      break;
    case "medium":
      vibrateIfSupported(22);
      break;
    case "success":
      vibrateIfSupported([12, 8, 12, 8, 20]);
      break;
    default:
      vibrateIfSupported(10);
  }
}

/** Pulse when CQ Scanner glimpses glyph data streaming from a sigil. */
export function feedbackSigilProximity(): void {
  vibrateSigil("light");
}

/** Stronger pulse when validation succeeds — pair with visuals. */
export function feedbackSigilAbsorption(): void {
  vibrateSigil("heavy");
}
