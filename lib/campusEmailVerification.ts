/**
 * Shared campus (URI) email verification helpers.
 * Safe for client + server — no secrets, hashes, or codes.
 */

import { isApprovedQaSignupEmail, isPilotSchoolSignupEmail } from "@/lib/signupEmailPolicy";
import { normalizeEmail } from "@/lib/platformAdmin";

export const CAMPUS_EMAIL_CODE_LENGTH = 6;
export const CAMPUS_EMAIL_CODE_TTL_SECONDS = 600;
export const CAMPUS_EMAIL_RESEND_COOLDOWN_SECONDS = 60;
export const CAMPUS_EMAIL_MAX_ATTEMPTS = 5;
export const CAMPUS_EMAIL_SEND_LIMIT = 5;
export const CAMPUS_EMAIL_SEND_WINDOW_SECONDS = 30 * 60;

export const CAMPUS_EMAIL_USER_MESSAGES = {
  sent: "We sent a 6-digit verification code to your URI email.",
  alreadyVerified: "Your URI email is already verified.",
  incorrect: "That code isn't correct. Try again.",
  expired: "That code has expired. Request a new one.",
  tooManyAttempts: "Too many attempts. Request a new code.",
  missing: "Request a new code, then try again.",
  invalidated: "That code is no longer valid. Request a new one.",
  sendFailed: "We couldn't send your code. Please try again.",
  domain: "Use your URI email address (@uri.edu) to verify.",
  cooldown: (seconds: number) => `You can request another code in ${seconds} second${seconds === 1 ? "" : "s"}.`,
} as const;

export function isValidCampusEmailCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function maskCampusEmail(email?: string | null): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "••••@••••";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const first = local.charAt(0) || "•";
  const bullets = "•".repeat(Math.max(local.length - 1, 1));
  return `${first}${bullets}@${domain}`;
}

/** Emails that may receive a CampusQuest campus-verification code. */
export function isAllowedCampusVerificationEmail(email?: string | null): boolean {
  if (isPilotSchoolSignupEmail(email)) return true;
  if (isApprovedQaSignupEmail(email)) return true;
  return false;
}

export function isCampusEmailVerified(profile: {
  campus_email_verified_at?: string | null;
}): boolean {
  const value = profile.campus_email_verified_at;
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Gate for onboarding routing.
 * - timestamp set → verified
 * - field omitted (undefined) → do not lock pre-migration payloads
 * - explicit null → must verify
 */
export function isCampusEmailVerificationRequired(profile: {
  campus_email_verified_at?: string | null;
}): boolean {
  if (profile.campus_email_verified_at === undefined) return false;
  return !isCampusEmailVerified(profile);
}

export function secondsUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}
