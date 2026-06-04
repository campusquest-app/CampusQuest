/** Safe haptics + XP celebration sounds (unlock on Scan QR before reward). */
export {
  beginXpForgeFill,
  computeForgeStrikeCount,
  isRewardAudioUnlocked,
  playAnvilStrike,
  playFinalForgeStrike,
  playForgeLevelUpBurst,
  playLevelUpRewardSound,
  playXpCompleteSound,
  playXpFillSound,
  playXpForgeSound,
  resetXpForgeFill,
  stopXpFillSound,
  stopXpForgeSound,
  syncXpForgeFillProgress,
  unlockRewardAudio,
  unlockRewardAudioSilently,
} from "@/lib/client/rewardAudio";
export type { XpForgeCompleteOptions, XpForgeFillOptions } from "@/lib/client/rewardAudio";
export {
  playMobileForgeSound,
  preloadMobileForgeAudio,
  stopMobileForgeSound,
  unlockMobileForgeAudio,
} from "@/lib/client/mobileXpForgeAudio";
export { XP_FORGE_AUDIO_ALT_URLS, XP_FORGE_AUDIO_URL } from "@/lib/client/xpForgeMp3";
import { playXpCompleteSound } from "@/lib/client/rewardAudio";
import { playLevelUpRewardSound } from "@/lib/client/rewardAudio";

/** @deprecated Use playXpFillSound during overlay fill. */
export function playXpGainSound(): void {
  void playXpCompleteSound();
}

export function playLevelUpSound(): void {
  playLevelUpRewardSound();
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
