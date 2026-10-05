import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("single-step signup email verification regression", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a confirmed Supabase auth user server-side without invoking public signUp", async () => {
    const createUser = vi.fn(async () => ({
      data: {
        user: {
          id: "user-1",
          email: "student@uri.edu",
          email_confirmed_at: "2026-09-17T12:00:00.000Z",
        },
      },
      error: null,
    }));
    const signUp = vi.fn();
    const signInWithPassword = vi.fn(async () => ({
      data: {
        user: { id: "user-1", email: "student@uri.edu" },
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    }));

    vi.doMock("../supabase", () => ({
      createAdminClient: () => ({ auth: { admin: { createUser } } }),
      createPublicClient: vi.fn(),
    }));

    const { provisionSignupAuthUser } = await import("../authBootstrap");
    const result = await provisionSignupAuthUser({
      publicClient: { auth: { signUp, signInWithPassword } } as never,
      email: "student@uri.edu",
      password: "StrongPassword1!",
    });

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "student@uri.edu",
        email_confirm: true,
      }),
    );
    expect(signUp).not.toHaveBeenCalled();
    expect(result.session).toMatchObject({ access_token: "access" });
  });

  it("prepares the six-digit email before the signup response is returned", () => {
    const signupRoute = readSource("app/api/auth/signup/route.ts");
    const sendCall = signupRoute.lastIndexOf("await prepareSignupVerification");
    const responseCall = signupRoute.lastIndexOf("return ok(");

    expect(signupRoute).toContain("sendCampusEmailVerification");
    expect(sendCall).toBeGreaterThan(-1);
    expect(responseCall).toBeGreaterThan(sendCall);
  });

  it("carries delivery failures into a visible code-screen retry state", () => {
    const authScreen = readSource("components/AuthScreen.tsx");
    const verificationScreen = readSource("components/auth/AuthOnboardingFlow.tsx");
    const deliveryState = readSource("lib/client/signupVerificationDelivery.ts");

    expect(authScreen).toContain('verificationState === "send_failed"');
    expect(authScreen).toContain("rememberSignupVerificationDeliveryFailed()");
    expect(verificationScreen).toContain("takeSignupVerificationDeliveryError()");
    expect(deliveryState).toContain("CAMPUS_EMAIL_USER_MESSAGES.sendFailed");
  });

  it("routes explicit unverified sessions to the code gate before onboarding", async () => {
    const { resolveProfileRoute } = await import("@/lib/client/appShellRoute");
    const { shouldStartOnboardingAtEmailVerification } = await import(
      "@/lib/onboarding/demographicOnboardingPolicy"
    );
    const profile = {
      onboarding_completed: false,
      display_name_changed_at: null,
      campus_email_verified_at: null,
    };

    expect(resolveProfileRoute(profile, { preferences: { interests: [] } })).toBe(
      "demographics_gate",
    );
    expect(
      shouldStartOnboardingAtEmailVerification({
        profile,
        preferences: { interests: [] },
      }),
    ).toBe(true);
  });

  it("uses the custom verification timestamp, not Supabase confirmation, for campus access", () => {
    const schoolVerification = readSource("lib/server/schoolVerification.ts");
    const campusAccess = readSource("lib/campusAccess.ts");

    expect(schoolVerification).toContain('.select("campus_email_verified_at")');
    expect(schoolVerification).not.toContain("isEmailVerifiedForCampus(user)");
    expect(campusAccess).toContain("Regular student access requires the app-owned campus");
  });

  it("keeps an Auth-confirmed student pending until the custom code is verified", async () => {
    const upsert = vi.fn((payload: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: {
            ...payload,
            school_name: null,
            school_domain: "uri.edu",
            status: "pending",
            verified_at: null,
          },
          error: null,
        }),
      }),
    }));
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { campus_email_verified_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      return { upsert };
    });

    vi.doMock("../supabase", () => ({
      createAdminClient: () => ({ from }),
    }));

    const { ensureSchoolVerificationForUser } = await import("../schoolVerification");
    const result = await ensureSchoolVerificationForUser({
      userClient: {} as never,
      user: {
        id: "user-1",
        email: "student@uri.edu",
        email_confirmed_at: "2026-09-17T12:00:00.000Z",
      },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        status: "pending",
        verified_at: null,
      }),
      { onConflict: "user_id" },
    );
    expect(result.status).toBe("pending");
  });

  it("preserves authenticated send, status, and verify boundaries", () => {
    for (const route of ["send", "status", "verify"]) {
      const source = readSource(`app/api/auth/email-verification/${route}/route.ts`);
      expect(source).toContain("requireAuthUser(request)");
    }
  });
});
