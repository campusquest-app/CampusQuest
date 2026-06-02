/** Safe haptics + optional sound hooks for XP celebrations (no-op until audio assets exist). */

export function playXpGainSound(): void {
  /* Optional: wire to /sounds/xp-gain.mp3 when available */
}

export function playLevelUpSound(): void {
  /* Optional: wire to /sounds/level-up.mp3 when available */
}

export function vibrateXpGain(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.(12);
  } catch {
    /* unsupported */
  }
}

export function vibrateLevelUp(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.([18, 40, 22, 55, 28]);
  } catch {
    /* unsupported */
  }
}
