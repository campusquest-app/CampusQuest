/**
 * Production signup email policy.
 *
 * Normal students must use the pilot school domain (`@uri.edu` by default).
 * A separate approved QA signup list can be extended later without opening
 * arbitrary non-URI domains to everyone.
 */

import {
  isKnownQaAccountEmail,
  LEGACY_QA_ACCOUNT_EMAILS,
  PERMANENT_QA_SIGNUP_EMAIL,
  resolveQaTestAccountEmail,
} from "@/lib/internalAccount";
import { normalizeEmail } from "@/lib/platformAdmin";
import { emailMatchesPilotDomain, extractCampusEmailDomain } from "@/lib/campusAccess";

function configuredPilotDomain(): string {
  return (process.env.NEXT_PUBLIC_PILOT_SCHOOL_DOMAIN || process.env.PILOT_SCHOOL_DOMAIN || "uri.edu")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

export const SCHOOL_EMAIL_REQUIRED_MESSAGE =
  "Use your URI email address (@uri.edu) to create a CampusQuest account.";

function envApprovedQaSignupEmails(): string[] {
  const raw = process.env.QA_SIGNUP_EMAIL ?? process.env.APPROVED_QA_SIGNUP_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

/** Exact emails allowed to sign up outside the pilot domain. */
export function listApprovedQaSignupEmails(): string[] {
  const emails = new Set<string>([PERMANENT_QA_SIGNUP_EMAIL, ...LEGACY_QA_ACCOUNT_EMAILS]);
  const resolved = normalizeEmail(resolveQaTestAccountEmail());
  if (resolved) emails.add(resolved);
  for (const email of envApprovedQaSignupEmails()) {
    emails.add(email);
  }
  return Array.from(emails);
}

export function isApprovedQaSignupEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isKnownQaAccountEmail(normalized)) return true;
  return envApprovedQaSignupEmails().includes(normalized);
}

export function isPilotSchoolSignupEmail(email?: string | null, pilotDomain?: string | null): boolean {
  const domain = extractCampusEmailDomain(email);
  if (!domain) return false;
  const configured = (pilotDomain ?? configuredPilotDomain()).trim().toLowerCase();
  return emailMatchesPilotDomain(email, configured);
}

/**
 * Whether this address may create a new CampusQuest account.
 * Platform-admin replay account (`nicklockhart22@uri.edu`) already matches URI.
 */
export function isAllowedSignupEmail(email?: string | null, pilotDomain?: string | null): boolean {
  if (isApprovedQaSignupEmail(email)) return true;
  return isPilotSchoolSignupEmail(email, pilotDomain);
}

export function signupEmailRejectionReason(
  email?: string | null,
  pilotDomain?: string | null,
): string | null {
  if (isAllowedSignupEmail(email, pilotDomain)) return null;
  return SCHOOL_EMAIL_REQUIRED_MESSAGE;
}
