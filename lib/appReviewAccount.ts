/**
 * Designated App Store review account.
 *
 * Apple reviewers cannot read this account's mailbox, so the account is
 * provisioned (scripts/ensure-qa-account.mjs) with
 * `profiles.campus_email_verified_at` already set — the same persisted field a
 * student gets after entering their 6-digit code. Nothing at request time
 * skips verification; the onboarding and campus gates read that field exactly
 * as they do for every other user.
 *
 * Exact, hardcoded email only. Deliberately ignores QA_TEST_ACCOUNT_EMAIL,
 * legacy QA aliases, and the @campusquestapp.com domain.
 *
 * No `@/` imports: this module is also loaded directly by Node from scripts/.
 */

export const APP_REVIEW_ACCOUNT_EMAIL = "qa_signup@campusquestapp.com";

/** Only role the reviewer account may hold. Ranked below every privileged role. */
export const APP_REVIEW_ACCOUNT_ROLE = "qa";

export type AppReviewProfileSnapshot = {
  role?: string | null;
  is_test_user?: boolean | null;
  campus_email_verified_at?: string | null;
} | null | undefined;

export function isAppReviewAccountEmail(email?: string | null): boolean {
  if (typeof email !== "string") return false;
  return email.trim().toLowerCase() === APP_REVIEW_ACCOUNT_EMAIL;
}

/** Exact email AND the provisioned QA test-user flags. */
export function isDesignatedAppReviewAccount(
  email: string | null | undefined,
  profile: AppReviewProfileSnapshot,
): boolean {
  return (
    isAppReviewAccountEmail(email) &&
    profile?.role === APP_REVIEW_ACCOUNT_ROLE &&
    profile?.is_test_user === true
  );
}

function existingVerifiedAt(profile: AppReviewProfileSnapshot): string | null {
  const value = profile?.campus_email_verified_at;
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Profile columns that make the reviewer account campus-verified, hidden,
 * and non-admin. Keeps an existing verification timestamp so re-running is a
 * no-op. Throws for any other email or a profile already holding another role.
 */
export function buildAppReviewProfilePatch(args: {
  email: string | null | undefined;
  existing: AppReviewProfileSnapshot;
  now?: Date;
}) {
  if (!isAppReviewAccountEmail(args.email)) {
    throw new Error("Campus pre-verification is only allowed for the designated App Review account.");
  }
  const currentRole = args.existing?.role ?? null;
  if (currentRole !== null && currentRole !== APP_REVIEW_ACCOUNT_ROLE && currentRole !== "student") {
    throw new Error(`Refusing to provision the App Review account: unexpected role "${currentRole}".`);
  }
  return {
    role: APP_REVIEW_ACCOUNT_ROLE,
    is_test_user: true,
    is_hidden: true,
    is_internal_tester: true,
    campus_email_verified_at: existingVerifiedAt(args.existing) ?? (args.now ?? new Date()).toISOString(),
  };
}
