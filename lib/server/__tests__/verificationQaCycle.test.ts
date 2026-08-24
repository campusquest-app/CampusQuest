import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";
import {
  buildPendingCycleMeta,
  canInvokeVerificationQaCycle,
  isEmailVerifiedForOnboardingUi,
  mergeVerificationQaAppMetadata,
  parseVerificationQaCycleMeta,
  resolveVerificationStatusLabel,
  shouldBlockContinueForVerification,
  shouldReusePendingCycleEmail,
  shouldSkipAutoConfirmForVerificationQa,
  VERIFICATION_QA_APP_META_KEY,
  VERIFICATION_QA_UI_COPY,
} from "@/lib/verificationQaCycle";
import {
  assertVerificationQaCaller,
  refreshVerificationQaCycleView,
  startVerificationQaCycle,
  type AdminUserOps,
} from "@/lib/server/verificationQaCycle";
import { ApiError } from "@/lib/server/http";
import { mapAuthCallbackError, parseAuthCallbackParams } from "@/lib/client/authCallbackErrors";
import { canAttemptResend, startResendCooldown } from "@/lib/client/authResendCooldown";
import { buildAuthQaStatus } from "@/lib/server/authQaStatus";

function makeUser(overrides: Partial<User> & { email: string }): User {
  const email = overrides.email;
  return {
    id: overrides.id ?? "user-1",
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
    ...overrides,
    email,
    email_confirmed_at: overrides.email_confirmed_at ?? undefined,
    confirmed_at: overrides.confirmed_at ?? overrides.email_confirmed_at ?? undefined,
  } as User;
}

function createMemoryAdminOps(initial: User): {
  ops: AdminUserOps;
  getUser: () => User;
  profileTouches: number;
} {
  let current = initial;
  let profileTouches = 0;
  const ops: AdminUserOps = {
    async getUserById(userId) {
      if (userId !== current.id) throw new ApiError(404, "missing", "AUTH_USER_NOT_FOUND");
      return current;
    },
    async updateUserById(userId, attributes) {
      if (userId !== current.id) throw new ApiError(404, "missing", "AUTH_USER_NOT_FOUND");
      current = {
        ...current,
        email_confirmed_at:
          attributes.email_confirm === false
            ? undefined
            : attributes.email_confirm === true
              ? current.email_confirmed_at ?? "2026-01-01T00:00:00Z"
              : current.email_confirmed_at,
        confirmed_at:
          attributes.email_confirm === false
            ? undefined
            : attributes.email_confirm === true
              ? current.confirmed_at ?? "2026-01-01T00:00:00Z"
              : current.confirmed_at,
        app_metadata: attributes.app_metadata
          ? { ...current.app_metadata, ...attributes.app_metadata }
          : current.app_metadata,
      };
      return current;
    },
  };
  return {
    ops,
    getUser: () => current,
    get profileTouches() {
      return profileTouches;
    },
  };
}

describe("verification QA allowlist + UI gates", () => {
  it("only the designated QA email can invoke the cycle", () => {
    expect(canInvokeVerificationQaCycle(ONBOARDING_QA_EMAIL)).toBe(true);
    expect(canInvokeVerificationQaCycle("student@uri.edu")).toBe(false);
    expect(canInvokeVerificationQaCycle("qa_signup@campusquestapp.com")).toBe(false);
    expect(() => assertVerificationQaCaller({ authenticatedEmail: "student@uri.edu" })).toThrow(
      /designated internal QA account/i,
    );
  });

  it("does not block Continue for a QA delivery test when verification is not required", () => {
    expect(
      shouldBlockContinueForVerification({
        emailConfirmedAuthoritative: false,
        requireEmailVerification: false,
        qaCyclePending: true,
      }),
    ).toBe(false);
  });

  it("still blocks Continue for normal users when verification is required and unconfirmed", () => {
    expect(
      shouldBlockContinueForVerification({
        emailConfirmedAuthoritative: false,
        requireEmailVerification: true,
        qaCyclePending: false,
      }),
    ).toBe(true);
  });

  it("keeps feature-flag session bypass for verified UI when a delivery test is pending", () => {
    expect(
      isEmailVerifiedForOnboardingUi({
        emailConfirmedAuthoritative: false,
        requireEmailVerification: false,
        hasSession: true,
        qaCyclePending: true,
      }),
    ).toBe(true);
    expect(
      isEmailVerifiedForOnboardingUi({
        emailConfirmedAuthoritative: true,
        requireEmailVerification: false,
        hasSession: true,
        qaCyclePending: true,
      }),
    ).toBe(true);
  });

  it("keeps normal users on standard one-time verification behavior", () => {
    expect(
      isEmailVerifiedForOnboardingUi({
        emailConfirmedAuthoritative: false,
        requireEmailVerification: false,
        hasSession: true,
        qaCyclePending: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockContinueForVerification({
        emailConfirmedAuthoritative: false,
        requireEmailVerification: true,
        qaCyclePending: false,
      }),
    ).toBe(true);
  });

  it("separates QA already-verified status copy from normal verification copy", () => {
    expect(
      resolveVerificationStatusLabel({
        isQaAccount: true,
        qaAccountAlreadyVerified: true,
        emailConfirmedForUi: true,
      }),
    ).toEqual({
      kind: "qa_already_verified",
      label: VERIFICATION_QA_UI_COPY.statusAlreadyVerified,
    });
    expect(
      resolveVerificationStatusLabel({
        isQaAccount: false,
        qaAccountAlreadyVerified: false,
        emailConfirmedForUi: false,
      }),
    ).toEqual({ kind: "needs_verification", label: "Check your URI email." });
    expect(VERIFICATION_QA_UI_COPY.sendTestButton).toBe("Send test verification email");
    expect(VERIFICATION_QA_UI_COPY.sentSuccess).toMatch(/newest email/i);
  });
});

describe("verification QA cycle start + idempotency", () => {
  it("starting one QA cycle sends exactly one Resend email", async () => {
    const memory = createMemoryAdminOps(
      makeUser({
        email: ONBOARDING_QA_EMAIL,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        app_metadata: { role: "admin", keep_me: true },
      }),
    );
    const send = vi.fn(async () => undefined);

    const first = await startVerificationQaCycle({
      userId: "user-1",
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      adminOps: memory.ops,
      sendConfirmationEmail: send,
      now: new Date("2026-08-24T12:00:00Z"),
      newCycleId: () => "cycle-1",
    });

    expect(first.emailSent).toBe(true);
    expect(first.alreadySent).toBe(false);
    expect(first.emailConfirmed).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(ONBOARDING_QA_EMAIL);
    expect(memory.getUser().email_confirmed_at).toBeUndefined();
    expect(memory.getUser().app_metadata.keep_me).toBe(true);
    expect(memory.getUser().app_metadata[VERIFICATION_QA_APP_META_KEY]).toMatchObject({
      cycleId: "cycle-1",
      status: "pending",
      initialEmailSentAt: "2026-08-24T12:00:00.000Z",
    });
  });

  it("remounting / repeating the same cycleId does not send another email", async () => {
    const memory = createMemoryAdminOps(
      makeUser({
        email: ONBOARDING_QA_EMAIL,
        email_confirmed_at: undefined,
        app_metadata: {
          [VERIFICATION_QA_APP_META_KEY]: buildPendingCycleMeta({
            cycleId: "cycle-1",
            startedAt: "2026-08-24T12:00:00.000Z",
            initialEmailSentAt: "2026-08-24T12:00:00.000Z",
          }),
        },
      }),
    );
    const send = vi.fn(async () => undefined);

    const resumed = await startVerificationQaCycle({
      userId: "user-1",
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      requestedCycleId: "cycle-1",
      adminOps: memory.ops,
      sendConfirmationEmail: send,
    });

    expect(resumed.emailSent).toBe(false);
    expect(resumed.alreadySent).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("refreshing with the same pending cycle is treated as already sent (no duplicate)", () => {
    const cycle = buildPendingCycleMeta({
      cycleId: "cycle-1",
      startedAt: "2026-08-24T12:00:00.000Z",
      initialEmailSentAt: "2026-08-24T12:00:00.000Z",
    });
    expect(shouldReusePendingCycleEmail({ cycle, requestedCycleId: "cycle-1" })).toBe(true);
    expect(shouldReusePendingCycleEmail({ cycle, requestedCycleId: "other" })).toBe(false);
    expect(shouldReusePendingCycleEmail({ cycle: null, requestedCycleId: "cycle-1" })).toBe(false);
  });

  it("resend button path remains available after cooldown (separate from cycle start)", () => {
    const now = 1_000_000;
    const stored = startResendCooldown({ email: ONBOARDING_QA_EMAIL, nowMs: now, cooldownMs: 60_000 });
    expect(
      canAttemptResend({
        email: ONBOARDING_QA_EMAIL,
        nowMs: now + 1_000,
        stored,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      canAttemptResend({
        email: ONBOARDING_QA_EMAIL,
        nowMs: now + 60_000,
        stored,
        inFlight: false,
      }),
    ).toBe(true);
  });

  it("normal users cannot invoke the QA reset", async () => {
    const memory = createMemoryAdminOps(makeUser({ email: "student@uri.edu" }));
    const send = vi.fn(async () => undefined);
    await expect(
      startVerificationQaCycle({
        userId: "user-1",
        authenticatedEmail: "student@uri.edu",
        adminOps: memory.ops,
        sendConfirmationEmail: send,
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_QA_FORBIDDEN" });
    expect(send).not.toHaveBeenCalled();
  });

  it("another intentional QA cycle can be started later and sends again", async () => {
    const memory = createMemoryAdminOps(
      makeUser({
        email: ONBOARDING_QA_EMAIL,
        email_confirmed_at: "2026-01-02T00:00:00Z",
        app_metadata: {
          [VERIFICATION_QA_APP_META_KEY]: {
            cycleId: "cycle-1",
            status: "completed",
            startedAt: "2026-08-24T12:00:00.000Z",
            initialEmailSentAt: "2026-08-24T12:00:00.000Z",
          },
        },
      }),
    );
    const send = vi.fn(async () => undefined);
    const second = await startVerificationQaCycle({
      userId: "user-1",
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      requestedCycleId: null,
      adminOps: memory.ops,
      sendConfirmationEmail: send,
      newCycleId: () => "cycle-2",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    expect(second.cycleId).toBe("cycle-2");
    expect(second.emailSent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("successful verification updates authoritative auth state and completes the cycle", async () => {
    const memory = createMemoryAdminOps(
      makeUser({
        email: ONBOARDING_QA_EMAIL,
        email_confirmed_at: "2026-08-24T13:00:00Z",
        app_metadata: {
          [VERIFICATION_QA_APP_META_KEY]: buildPendingCycleMeta({
            cycleId: "cycle-1",
            startedAt: "2026-08-24T12:00:00.000Z",
            initialEmailSentAt: "2026-08-24T12:00:00.000Z",
          }),
        },
      }),
    );

    const view = await refreshVerificationQaCycleView({
      userId: "user-1",
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      adminOps: memory.ops,
    });

    expect(view.emailConfirmed).toBe(true);
    expect(view.cyclePending).toBe(false);
    expect(view.cycle?.status).toBe("completed");
    expect(shouldSkipAutoConfirmForVerificationQa(memory.getUser().app_metadata)).toBe(false);
  });

  it("existing app_metadata / admin markers remain untouched aside from the QA cycle key", async () => {
    const memory = createMemoryAdminOps(
      makeUser({
        email: ONBOARDING_QA_EMAIL,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        app_metadata: { platform_admin: true, custom_flag: "keep" },
      }),
    );
    await startVerificationQaCycle({
      userId: "user-1",
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      adminOps: memory.ops,
      sendConfirmationEmail: async () => undefined,
      newCycleId: () => "cycle-x",
    });
    const meta = memory.getUser().app_metadata;
    expect(meta.platform_admin).toBe(true);
    expect(meta.custom_flag).toBe("keep");
    expect(parseVerificationQaCycleMeta(meta)?.cycleId).toBe("cycle-x");
    expect(memory.profileTouches).toBe(0);
  });
});

describe("verification callback + secrets surface", () => {
  it("clicking a valid verification link path has no mapped recovery error", () => {
    const params = parseAuthCallbackParams({ search: "?code=valid-exchange-code" });
    expect(mapAuthCallbackError(params)).toBeNull();
  });

  it("expired/invalid links do not verify and offer resend recovery", () => {
    const expired = mapAuthCallbackError(
      parseAuthCallbackParams({ search: "?error=access_denied&error_code=otp_expired" }),
    );
    expect(expired?.code).toBe("otp_expired");
    expect(expired?.allowResend).toBe(true);
  });

  it("Auth QA status never exposes Resend API keys or service-role credentials", () => {
    const status = buildAuthQaStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toMatch(/re_[A-Za-z0-9]/i);
    expect(serialized).not.toContain("service_role");
    expect(serialized.toLowerCase()).not.toContain("api_key");
    expect(status.supabase.hasServiceRoleKey).toBeTypeOf("boolean");
    expect(status.emailProvider.smtpConfiguredInApp).toBe(false);
    expect(status.onboardingQa.verificationCycle).toMatch(/Resend/i);
  });

  it("merge helper can clear cycle metadata without wiping sibling app_metadata", () => {
    const merged = mergeVerificationQaAppMetadata(
      { keep: 1, [VERIFICATION_QA_APP_META_KEY]: { cycleId: "old" } },
      null,
    );
    expect(merged.keep).toBe(1);
    expect(merged[VERIFICATION_QA_APP_META_KEY]).toBeUndefined();
  });
});
