import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/authBootstrap", () => ({
  findAuthUserIdByEmail: vi.fn(),
}));

import { createAdminClient } from "@/lib/server/supabase";
import {
  isTestUserProfile,
  resetQaOnboardingOnLoginIfTestUser,
  resetQaOnboardingState,
} from "@/lib/server/qaTestAccount";
import { ApiError } from "@/lib/server/http";

describe("QA onboarding reset safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(select).toHaveBeenCalledWith("id, is_test_user");
  });

  it("treats only is_test_user=true as a test profile flag", () => {
    expect(isTestUserProfile({ is_test_user: true })).toBe(true);
    expect(isTestUserProfile({ is_test_user: false })).toBe(false);
    expect(isTestUserProfile(null)).toBe(false);
  });
});
