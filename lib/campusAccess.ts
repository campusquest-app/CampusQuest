/**
 * Campus feature eligibility — shared client/server logic.
 * Platform admins and internal testers always bypass pilot school domain requirements.
 */

import { normalizeEmail } from "@/lib/platformAdmin";
import { isInternalAccount } from "@/lib/internalAccount";

export type CampusVerificationSnapshot = {
  status: "pending" | "verified";
  schoolName: string | null;
  schoolDomain: string | null;
  requiredPilotDomain?: string | null;
};

export function isEmailVerifiedForCampus(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

export function extractCampusEmailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
}

export function emailMatchesPilotDomain(
  email: string | null | undefined,
  pilotDomain: string | null | undefined,
): boolean {
  if (!pilotDomain) return false;
  const domain = extractCampusEmailDomain(email);
  if (!domain) return false;
  const normalizedPilot = pilotDomain.trim().toLowerCase().replace(/^@+/, "");
  return domain === normalizedPilot;
}

/**
 * Single gate for campus pilot features (Quad, orgs, events, map, etc.).
 * Trusted internal accounts (admins and internal testers / permanent QA email)
 * bypass campus email rules entirely; only normal users are evaluated against
 * the pilot domain.
 */
export function canAccessCampusFeatures(args: {
  isPlatformAdmin: boolean;
  /** Role/flag/exact-QA-email bypass — never whole-domain @campusquestapp.com. */
  isInternalTester?: boolean;
  email?: string | null;
  emailVerified: boolean;
  pilotDomain?: string | null;
  verification?: CampusVerificationSnapshot | null;
}): boolean {
  if (args.isPlatformAdmin || args.isInternalTester) return true;
  // Exact known QA emails can bypass even before profile flags hydrate.
  if (isInternalAccount({ email: args.email }, null)) return true;

  const verification = args.verification;
  if (
    verification?.status === "verified" &&
    Boolean(verification.schoolDomain) &&
    Boolean(verification.schoolName)
  ) {
    return true;
  }

  const email = normalizeEmail(args.email);
  const isConfirmed = args.emailVerified;
  const isUriStudent = emailMatchesPilotDomain(email, args.pilotDomain ?? null);

  return isConfirmed && isUriStudent;
}
