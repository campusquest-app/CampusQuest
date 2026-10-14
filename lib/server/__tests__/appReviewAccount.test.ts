import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/authBootstrap", () => ({
  findAuthUserIdByEmail: vi.fn(),
}));

import { createAdminClient } from "@/lib/server/supabase";
import {
  APP_REVIEW_ACCOUNT_EMAIL,
  buildAppReviewProfilePatch,
  isAppReviewAccountEmail,
  isDesignatedAppReviewAccount,
} from "@/lib/appReviewAccount";
import { isCampusEmailVerificationRequired } from "@/lib/campusEmailVerification";
import { resolveDemographicResumeStep } from "@/lib/onboarding/flow";
import { QA_ACCOUNT_PROFILE_FLAGS } from "@/lib/internalAccount";
import { isPlatformAdmin, roleAtLeast } from "@/lib/server/permissions";
import { resetQaOnboardingState } from "@/lib/server/qaTestAccount";

const VERIFIED_AT = "2026-10-14T18:00:00.000Z";

function fakeAdmin(profile: Record<string, unknown>, email: string) {
  const profileUpdates: Record<string, unknown>[] = [];
  const chain = (result: unknown) => {
    const builder: Record<string, unknown> = {
      eq: () => builder,
      is: () => builder,
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve, reject),
    };
    return builder;
  };
  const from = vi.fn((table: string) => ({
    select: () => chain({ data: table === "profiles" ? profile : null, error: null }),
    update: (patch: Record<string, unknown>) => {
      if (table === "profiles") profileUpdates.push(patch);
      return chain({ error: null });
    },
    delete: () => chain({ error: null }),
  }));
  const admin = {
    from,
    auth: { admin: { getUserById: async () => ({ data: { user: { email } } }) } },
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return { profileUpdates };
}

const reviewerProfile = {
  id: "reviewer-1",
  is_test_user: true,
  role: "qa",
  campus_email_verified_at: VERIFIED_AT,
};

describe("App Review account campus verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normal unverified students still require campus verification", () => {
    const student = { campus_email_verified_at: null };
    expect(isCampusEmailVerificationRequired(student)).toBe(true);
    expect(
      resolveDemographicResumeStep({ profile: student, startAtEmailVerification: true }),
    ).toBe("campus");
  });

  it("the provisioned reviewer profile is already campus-verified", () => {
    const patch = buildAppReviewProfilePatch({
      email: APP_REVIEW_ACCOUNT_EMAIL,
      existing: null,
      now: new Date(VERIFIED_AT),
    });
    expect(patch.campus_email_verified_at).toBe(VERIFIED_AT);
    expect(isCampusEmailVerificationRequired(patch)).toBe(false);
    expect(resolveDemographicResumeStep({ profile: patch, startAtEmailVerification: true })).toBe("ready");
  });

  it("provisioning is idempotent and keeps the existing verification timestamp", () => {
    const first = buildAppReviewProfilePatch({ email: APP_REVIEW_ACCOUNT_EMAIL, existing: reviewerProfile });
    const second = buildAppReviewProfilePatch({
      email: APP_REVIEW_ACCOUNT_EMAIL,
      existing: { ...reviewerProfile, ...first },
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(first.campus_email_verified_at).toBe(VERIFIED_AT);
    expect(second).toEqual(first);
  });

  it.each([
    "qa_signup2@campusquestapp.com",
    "qa-signup@campusquest.app",
    "qa@campusquest.app",
    "reviewer@campusquestapp.com",
    "qa_signup@campusquestapp.com.evil.test",
    "qa_signup@uri.edu",
    "",
    null,
  ])("rejects QA-looking email %s", (email) => {
    expect(isAppReviewAccountEmail(email)).toBe(false);
    expect(isDesignatedAppReviewAccount(email, reviewerProfile)).toBe(false);
    expect(() => buildAppReviewProfilePatch({ email, existing: null })).toThrow(/designated App Review account/);
  });

  it("ignores the QA_TEST_ACCOUNT_EMAIL override", () => {
    vi.stubEnv("QA_TEST_ACCOUNT_EMAIL", "someone-else@campusquestapp.com");
    expect(isAppReviewAccountEmail("someone-else@campusquestapp.com")).toBe(false);
    expect(isAppReviewAccountEmail(" QA_SIGNUP@CampusQuestApp.com ")).toBe(true);
  });

  it("requires the provisioned QA flags in addition to the exact email", () => {
    expect(isDesignatedAppReviewAccount(APP_REVIEW_ACCOUNT_EMAIL, reviewerProfile)).toBe(true);
    expect(isDesignatedAppReviewAccount(APP_REVIEW_ACCOUNT_EMAIL, { ...reviewerProfile, is_test_user: false })).toBe(false);
    expect(isDesignatedAppReviewAccount(APP_REVIEW_ACCOUNT_EMAIL, { ...reviewerProfile, role: "admin" })).toBe(false);
    expect(isDesignatedAppReviewAccount(APP_REVIEW_ACCOUNT_EMAIL, null)).toBe(false);
  });

  it("reviewer account remains non-admin", () => {
    const patch = buildAppReviewProfilePatch({ email: APP_REVIEW_ACCOUNT_EMAIL, existing: null });
    expect(patch.role).toBe("qa");
    expect(QA_ACCOUNT_PROFILE_FLAGS.role).toBe("qa");
    expect(roleAtLeast("qa", "admin")).toBe(false);
    const reviewerUser = {
      id: "reviewer-1",
      email: APP_REVIEW_ACCOUNT_EMAIL,
      email_confirmed_at: VERIFIED_AT,
    } as unknown as User;
    expect(isPlatformAdmin(reviewerUser, "qa")).toBe(false);
  });

  it.each(["admin", "super_admin", "faculty_staff", "beta_internal"])(
    "refuses to provision over an existing %s role",
    (role) => {
      expect(() =>
        buildAppReviewProfilePatch({ email: APP_REVIEW_ACCOUNT_EMAIL, existing: { ...reviewerProfile, role } }),
      ).toThrow(/unexpected role/);
    },
  );

  it("login/onboarding reset keeps the reviewer's campus verification", async () => {
    const { profileUpdates } = fakeAdmin(reviewerProfile, APP_REVIEW_ACCOUNT_EMAIL);
    await resetQaOnboardingState("reviewer-1");
    expect(profileUpdates).toHaveLength(1);
    expect(profileUpdates[0]).not.toHaveProperty("campus_email_verified_at");
    expect(profileUpdates[0]).toMatchObject({ onboarding_completed: false });
  });

  it("reset never writes null into the NOT NULL jsonb profile columns", async () => {
    const { profileUpdates } = fakeAdmin(reviewerProfile, APP_REVIEW_ACCOUNT_EMAIL);
    await resetQaOnboardingState("reviewer-1");
    for (const column of ["game_state_json", "equipment_loadout_json", "character_stats_json"]) {
      expect(profileUpdates[0][column]).toEqual({});
    }
  });

  it("other QA test accounts still lose campus verification on reset", async () => {
    const { profileUpdates } = fakeAdmin({ ...reviewerProfile, id: "legacy-qa" }, "qa-signup@campusquest.app");
    await resetQaOnboardingState("legacy-qa");
    expect(profileUpdates[0]).toMatchObject({ campus_email_verified_at: null });
  });

  it("an exact reviewer email without the QA flags is not preserved", async () => {
    const { profileUpdates } = fakeAdmin({ ...reviewerProfile, role: "student" }, APP_REVIEW_ACCOUNT_EMAIL);
    await resetQaOnboardingState("reviewer-1");
    expect(profileUpdates[0]).toMatchObject({ campus_email_verified_at: null });
  });
});
