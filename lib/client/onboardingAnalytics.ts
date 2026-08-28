"use client";

import { postAuthed } from "@/lib/client/dashboardApi";
import type { OnboardingFunnelPayload } from "@/lib/onboarding/analyticsEvents";

export function trackOnboardingEvent(payload: OnboardingFunnelPayload): void {
  if (typeof window === "undefined") return;
  void postAuthed("/api/me/onboarding-events", {
    eventName: payload.eventName,
    stepNumber: payload.stepNumber ?? null,
    elapsedMs: payload.elapsedMs ?? null,
    skipped: payload.skipped ?? null,
  }).catch(() => {
    /* Funnel analytics must never block onboarding. */
  });
}
