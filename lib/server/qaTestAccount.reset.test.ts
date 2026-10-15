import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/authBootstrap", () => ({
  findAuthUserIdByEmail: vi.fn(),
}));

vi.mock("@/lib/reviewDemoSeed", () => ({
  seedReviewDemoContent: vi.fn(async () => ({
    profiles: 0,
    posts: 0,
    events: 0,
    organizations: 0,
    notifications: 0,
    messages: 0,
  })),
}));

vi.mock("@/lib/server/pilotMode", () => ({
  getPilotSchoolConfig: vi.fn(() => ({ schoolName: "University of Rhode Island", schoolDomain: "uri.edu" })),
}));

import { createAdminClient } from "@/lib/server/supabase";
import { seedReviewDemoContent } from "@/lib/reviewDemoSeed";
import {
  buildQaOnboardingResetPatch,
  isTestUserProfile,
  resetQaOnboardingOnLoginIfTestUser,
  resetQaOnboardingState,
} from "@/lib/server/qaTestAccount";
import { isDemographicsRequired } from "@/lib/onboarding/demographicOnboardingPolicy";
import { resolveDemographicResumeStep } from "@/lib/onboarding/flow";
import { ApiError } from "@/lib/server/http";

describe("QA onboarding reset safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REVIEW_DEMO_SEED_DISABLED;
  });

  it("does not reset a normal student profile (auth data stays untouched)", async () => {
    const admin = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const didReset = await resetQaOnboardingOnLoginIfTestUser({
      id: "student-1",
      is_test_user: false,
      role: "student",
      email: "student@uri.edu",
    });

    expect(didReset).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("does not reset ordinary internal testers without is_test_user", async () => {
    const admin = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const didReset = await resetQaOnboardingOnLoginIfTestUser({
      id: "beta-1",
      is_test_user: false,
      is_internal_tester: true,
      role: "beta_internal",
      email: "tester@example.com",
    });

    expect(didReset).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("does not reset the dedicated admin QA account even if someone flags it as a test user", async () => {
    const admin = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const didReset = await resetQaOnboardingOnLoginIfTestUser({
      id: "admin-1",
      is_test_user: true,
      role: "admin",
      email: "nicklockhart22@uri.edu",
    });

    expect(didReset).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("refuses to wipe onboarding for a non-test user id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "student-1", is_test_user: false },
      error: null,
    });
    const selectEq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq: selectEq }));
    const from = vi.fn(() => ({ select }));
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    await expect(resetQaOnboardingState("student-1")).rejects.toMatchObject({
      code: "QA_RESET_NOT_TEST_USER",
    } satisfies Partial<ApiError>);
    // Only a lookup ran — no profile update / deletes that could corrupt auth.
    expect(select).toHaveBeenCalledWith("id, is_test_user, role");
  });

  it("treats only is_test_user=true as a test profile flag", () => {
    expect(isTestUserProfile({ is_test_user: true })).toBe(true);
    expect(isTestUserProfile({ is_test_user: false })).toBe(false);
    expect(isTestUserProfile(null)).toBe(false);
  });

  it("clears stale student_status so the reviewer is not stuck as faculty/staff", () => {
    const patch = buildQaOnboardingResetPatch({ preserveCampusVerification: true });
    expect(patch.student_status).toBeNull();
    expect(patch.institution_id).toBeNull();
    expect(patch.onboarding_version).toBeNull();
    expect(patch.qa_selected_role).toBeNull();
    expect(patch.onboarding_completed).toBe(false);
    expect(patch.onboarding_character_completed).toBe(false);
    expect(patch).not.toHaveProperty("campus_email_verified_at");
    expect(patch).not.toHaveProperty("role");
    expect(patch).not.toHaveProperty("username");
    expect(patch).not.toHaveProperty("display_name");
  });

  it("does not wipe onboarding or social state when the App Review account signs in", async () => {
    const admin = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const didReset = await resetQaOnboardingOnLoginIfTestUser({
      id: "qa-1",
      is_test_user: true,
      role: "qa",
      email: "qa_signup@campusquestapp.com",
    });

    expect(didReset).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
    expect(seedReviewDemoContent).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerUserId: "qa-1", expectedReviewerEmail: "qa_signup@campusquestapp.com" }),
    );
  });

  it("does not call demo seed when REVIEW_DEMO_SEED_DISABLED is true", async () => {
    process.env.REVIEW_DEMO_SEED_DISABLED = "true";
    const admin = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const didReset = await resetQaOnboardingOnLoginIfTestUser({
      id: "qa-1",
      is_test_user: true,
      role: "qa",
      email: "qa_signup@campusquestapp.com",
    });

    expect(didReset).toBe(false);
    expect(seedReviewDemoContent).not.toHaveBeenCalled();
  });

  it("after reset, demographics resume at About You instead of skipping to Personalize", () => {
    const stale = {
      student_status: "faculty_staff",
      institution_id: "uri",
      onboarding_version: 2,
      campus_email_verified_at: "2026-10-14T18:24:57.777Z",
    };
    expect(resolveDemographicResumeStep({ profile: stale, preferences: { exists: false, interests: [] } })).toBe(
      "personalize",
    );

    const patch = buildQaOnboardingResetPatch({ preserveCampusVerification: true });
    const resetProfile = {
      student_status: patch.student_status as string | null,
      institution_id: patch.institution_id as string | null,
      onboarding_version: patch.onboarding_version as number | null,
      campus_email_verified_at: stale.campus_email_verified_at,
      onboarding_completed: false,
      onboarding_character_completed: false,
    };
    expect(isDemographicsRequired({ profile: resetProfile, preferences: null })).toBe(true);
    expect(resolveDemographicResumeStep({ profile: resetProfile, preferences: { exists: false, interests: [] } })).toBe(
      "about_you",
    );
  });
});
