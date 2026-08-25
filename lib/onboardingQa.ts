/**
 * Session-level onboarding QA for the dedicated platform-admin account.
 *
 * This is intentionally separate from the wipe-on-login QA test account
 * (`qa_signup@campusquestapp.com`). Replaying onboarding for this email MUST
 * never mutate auth identity, admin roles, XP, stats, or user-generated data.
 */

import { normalizeEmail } from "@/lib/platformAdmin";

/** Exact account that may replay character onboarding once per login session. */
export const ONBOARDING_QA_EMAIL = "nicklockhart22@uri.edu";

export function isOnboardingQaEmail(email?: string | null): boolean {
  return normalizeEmail(email) === ONBOARDING_QA_EMAIL;
}

/** Client QA controls such as "Send test verification email". Never true for ordinary users. */
export function shouldShowCampusVerificationQaControls(email?: string | null): boolean {
  return isOnboardingQaEmail(email);
}

function onboardingQaLogsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_QA_LOG === "1";
}

/** Dev/admin-QA logs only. Never pass tokens, passwords, or secrets. */
export function logOnboardingQa(phase: string, details?: Record<string, unknown>): void {
  if (!onboardingQaLogsEnabled()) return;
  console.info("[Onboarding QA]", phase, details ?? {});
}
