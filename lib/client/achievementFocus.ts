"use client";

/**
 * Lightweight cross-component signal used to deep-link into the Trophy Room and
 * open a specific achievement's detail (e.g. "View Badge" on the unlock modal).
 *
 * The focused id is latched until consumed so it survives the Trophy Room mounting
 * after the tab switch fires. Subscribers (Dashboard) switch tabs; the Trophy Room
 * consumes the id on mount to open the detail sheet.
 */
type FocusListener = (achievementId: string | null) => void;

let focusedAchievementId: string | null = null;
const listeners = new Set<FocusListener>();

export function focusAchievement(achievementId: string): void {
  focusedAchievementId = achievementId;
  listeners.forEach((fn) => fn(achievementId));
}

export function getFocusedAchievement(): string | null {
  return focusedAchievementId;
}

/** Read and clear the pending focus (call once when the Trophy Room opens it). */
export function consumeFocusedAchievement(): string | null {
  const value = focusedAchievementId;
  focusedAchievementId = null;
  return value;
}

export function subscribeAchievementFocus(listener: FocusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
