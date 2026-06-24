"use client";

import { patchAuthed } from "@/lib/client/dashboardApi";
import { isOnboardingTutorialDisabled } from "@/lib/client/onboardingTutorialGating";

let dismissInFlight: Promise<void> | null = null;

/** Best-effort server flags so returning users never re-enter tutorial gating. */
export function dismissOnboardingTutorialOnServer(): Promise<void> {
  if (!isOnboardingTutorialDisabled()) return Promise.resolve();
  if (typeof window === "undefined") return Promise.resolve();
  if (dismissInFlight) return dismissInFlight;

  dismissInFlight = patchAuthed("/api/me/profile", {
    starterIntroSeen: true,
    beginnerChainCelebrationSeen: true,
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      dismissInFlight = null;
    });

  return dismissInFlight;
}
