/**
 * Centralized internal / QA account identity.
 *
 * Use {@link isInternalAccount} everywhere campus bypass, public-list exclusion,
 * and test-account handling need a single source of truth.
 *
 * IMPORTANT:
 * - Exact, case-insensitive email match only for the permanent QA address.
 * - Never treat every `@campusquestapp.com` address as internal.
 * - Platform admins stay on a separate path (`isPlatformAdmin`) — do not fold
 *   them into this helper.
 */

import { normalizeEmail } from "@/lib/platformAdmin";

/** Permanent store/QA onboarding account — exact match only. */
export const PERMANENT_QA_SIGNUP_EMAIL = "qa_signup@campusquestapp.com";

/** Legacy QA emails still recognized for reset/protection of existing accounts. */
export const LEGACY_QA_ACCOUNT_EMAILS = [
  "qa-signup@campusquest.app",
  "qa@campusquest.app",
] as const;

export type InternalAccountUser = {
  email?: string | null;
} | null | undefined;

export type InternalAccountProfile = {
  is_test_user?: boolean | null;
  is_internal_tester?: boolean | null;
  is_hidden?: boolean | null;
  role?: string | null;
} | null | undefined;

function envQaTestAccountEmail(): string {
  return normalizeEmail(process.env.QA_TEST_ACCOUNT_EMAIL);
}

/**
 * Exact match for the permanent QA signup email (and optional env override).
 * Does NOT match arbitrary `@campusquestapp.com` addresses.
 */
export function isPermanentQaEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (normalized === PERMANENT_QA_SIGNUP_EMAIL) return true;
  const envEmail = envQaTestAccountEmail();
  return Boolean(envEmail) && normalized === envEmail;
}

/** Permanent QA email plus legacy exact aliases used by older environments. */
export function isKnownQaAccountEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isPermanentQaEmail(normalized)) return true;
  return (LEGACY_QA_ACCOUNT_EMAILS as readonly string[]).includes(normalized);
}

/**
 * Default email used when provisioning the permanent QA account.
 * Prefer env override, else the permanent address.
 */
export function resolveQaTestAccountEmail(): string {
  const envEmail = envQaTestAccountEmail();
  return envEmail || PERMANENT_QA_SIGNUP_EMAIL;
}

/**
 * True for internal testing accounts (QA / beta_internal / flagged test users).
 * Grants campus-domain bypass when wired through campus access gates.
 * Does NOT include platform admins.
 */
export function isInternalAccount(
  user?: InternalAccountUser,
  profile?: InternalAccountProfile,
): boolean {
  if (isKnownQaAccountEmail(user?.email)) return true;
  if (profile?.is_test_user === true) return true;
  if (profile?.is_internal_tester === true) return true;
  const role = profile?.role ?? null;
  if (role === "qa" || role === "beta_internal") return true;
  return false;
}

/** Profile flags applied to the permanent QA account on signup / ensure. */
export const QA_ACCOUNT_PROFILE_FLAGS = {
  role: "qa" as const,
  is_test_user: true,
  is_hidden: true,
  is_internal_tester: true,
};
