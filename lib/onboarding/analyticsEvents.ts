/**
 * First-party onboarding funnel event names.
 * Never attach passwords, OTP codes, or auth tokens.
 */

export const ONBOARDING_FUNNEL_EVENTS = [
  "onboarding_started",
  "onboarding_status_completed",
  "onboarding_graduation_completed",
  "onboarding_school_completed",
  "onboarding_interests_completed",
  "onboarding_communities_completed",
  "onboarding_verification_sent",
  "onboarding_verification_completed",
  "onboarding_preferences_saved",
  "onboarding_avatar_completed",
  "onboarding_completed",
  "realm_intro_started",
  "realm_intro_skipped",
  "realm_intro_completed",
] as const;

export type OnboardingFunnelEventName = (typeof ONBOARDING_FUNNEL_EVENTS)[number];

export type OnboardingFunnelPayload = {
  eventName: OnboardingFunnelEventName;
  stepNumber?: number | null;
  elapsedMs?: number | null;
  skipped?: boolean | null;
};

export function isOnboardingFunnelEventName(value: unknown): value is OnboardingFunnelEventName {
  return typeof value === "string" && (ONBOARDING_FUNNEL_EVENTS as readonly string[]).includes(value);
}
