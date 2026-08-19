import { describe, expect, it } from "vitest";
import { canEnterAuthenticatedApp, hasConfirmedEmail } from "@/lib/authAccess";
import {
  applyOnboardingQaReplayOverride,
  decideOnboardingQaReplay,
  markOnboardingQaRecordCompleted,
} from "@/lib/client/onboardingQaSession";
import { resolveProfileRoute } from "@/lib/client/appShellRoute";
import { isOnboardingQaEmail, ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";
import { isAllowedSignupEmail, signupEmailRejectionReason } from "@/lib/signupEmailPolicy";
import { canAttemptResend, remainingResendCooldownMs, startResendCooldown } from "@/lib/client/authResendCooldown";
import { mapAuthCallbackError, parseAuthCallbackParams, shouldOfferVerificationResend } from "@/lib/client/authCallbackErrors";
import { isProfileInitializingError, shouldContinueProfileReadyRetry } from "@/lib/client/profileReadyRetry";
import { AUTH_EMAIL_USER_MESSAGES, classifyAuthEmailProviderError } from "@/lib/authEmailDelivery";
import { mapAuthEmailActionError, HttpRequestError } from "@/lib/client/authErrorMessages";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import { isPlatformAdmin } from "@/lib/server/permissions";

function jwtFor(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  return `eyJhbGciOiJub25lIn0.${b64}.sig`;
}

describe("normal and new student auth routing", () => {
  it("verified + onboarding complete student skips onboarding on login", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        onboarding_character_completed: true,
        role: "student",
      }),
    ).toBe("app");
  });

  it("unverified users cannot enter the authenticated app when verification is required", () => {
    expect(hasConfirmedEmail({ email_confirmed_at: null })).toBe(false);
    expect(canEnterAuthenticatedApp({ emailConfirmed: false, requireEmailVerification: true })).toBe(false);
    expect(canEnterAuthenticatedApp({ emailConfirmed: true, requireEmailVerification: true })).toBe(true);
  });

  it("newly verified student with incomplete profile sees onboarding", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: false,
        onboarding_character_completed: false,
        role: null,
      }),
    ).toBe("character_gate");
  });

  it("completed student still skips onboarding after a later login", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: "student",
      }),
    ).toBe("app");
  });
});

describe("admin QA onboarding replay", () => {
  it("matches only the dedicated admin QA email", () => {
    expect(isOnboardingQaEmail(ONBOARDING_QA_EMAIL)).toBe(true);
    expect(isOnboardingQaEmail("NickLockhart22@uri.edu")).toBe(true);
    expect(isOnboardingQaEmail("student@uri.edu")).toBe(false);
    expect(isOnboardingQaEmail("qa_signup@campusquestapp.com")).toBe(false);
  });

  it("shows onboarding on a new login session even when the profile is complete", () => {
    const decision = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "admin-1",
      sessionId: "session-a",
      stored: null,
    });
    expect(decision.replay).toBe(true);
    expect(decision.activated).toBe(true);

    const routed = resolveProfileRoute(
      applyOnboardingQaReplayOverride(
        { onboarding_completed: true, onboarding_character_completed: true, role: "admin" },
        decision.replay,
      ),
    );
    expect(routed).toBe("character_gate");
  });

  it("does not restart onboarding after it is completed in the same session", () => {
    const pending = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "admin-1",
      sessionId: "session-a",
      stored: null,
    });
    const completed = markOnboardingQaRecordCompleted(pending.record);
    const again = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "admin-1",
      sessionId: "session-a",
      stored: completed,
    });
    expect(again.replay).toBe(false);
    expect(
      resolveProfileRoute(
        applyOnboardingQaReplayOverride(
          { onboarding_completed: true, role: "super_admin" },
          again.replay,
        ),
      ),
    ).toBe("app");
  });

  it("replays again after logout/login (new session id)", () => {
    const previous = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "admin-1",
      sessionId: "session-a",
      stored: { userId: "admin-1", sessionId: "session-a", phase: "completed" },
    });
    expect(previous.replay).toBe(false);

    const nextLogin = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "admin-1",
      sessionId: "session-b",
      stored: { userId: "admin-1", sessionId: "session-a", phase: "completed" },
    });
    expect(nextLogin.replay).toBe(true);
    expect(nextLogin.activated).toBe(true);
  });

  it("does not apply replay to ordinary students", () => {
    const decision = decideOnboardingQaReplay({
      email: "student@uri.edu",
      userId: "student-1",
      sessionId: "session-1",
      stored: null,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.replay).toBe(false);
  });
});

describe("admin preservation", () => {
  it("session overlay does not mutate stored completion flags", () => {
    const profile = {
      onboarding_completed: true,
      onboarding_character_completed: true,
      role: "admin" as const,
    };
    const overlay = applyOnboardingQaReplayOverride(profile, true);
    expect(overlay.onboarding_completed).toBe(false);
    expect(profile.onboarding_completed).toBe(true);
    expect(profile.role).toBe("admin");
  });

  it("admin authorization stays independent of onboarding_completed", () => {
    expect(
      isPlatformAdmin(
        { email: ONBOARDING_QA_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z" } as never,
        "admin",
      ),
    ).toBe(true);
    expect(
      isPlatformAdmin(
        { email: ONBOARDING_QA_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z" } as never,
        "student",
      ),
    ).toBe(true);
  });
});

describe("signup email policy", () => {
  it("keeps the URI restriction for normal students", () => {
    expect(isAllowedSignupEmail("student@uri.edu")).toBe(true);
    expect(isAllowedSignupEmail("someone@gmail.com")).toBe(false);
    expect(signupEmailRejectionReason("someone@gmail.com")).toMatch(/URI email/i);
  });

  it("allows the dedicated QA signup account without opening all domains", () => {
    expect(isAllowedSignupEmail("qa_signup@campusquestapp.com")).toBe(true);
    expect(isAllowedSignupEmail("random@campusquestapp.com")).toBe(false);
  });
});

describe("verification resend", () => {
  it("disables parallel / cooldown-bypassing resends", () => {
    const now = 1_000_000;
    expect(canAttemptResend({ email: "a@uri.edu", nowMs: now, stored: null, inFlight: false })).toBe(true);
    expect(canAttemptResend({ email: "a@uri.edu", nowMs: now, stored: null, inFlight: true })).toBe(false);
    const stored = startResendCooldown({ email: "a@uri.edu", nowMs: now, cooldownMs: 60_000 });
    expect(canAttemptResend({ email: "a@uri.edu", nowMs: now + 1_000, stored, inFlight: false })).toBe(false);
    expect(remainingResendCooldownMs({ email: "a@uri.edu", nowMs: now + 1_000, stored })).toBe(59_000);
    expect(canAttemptResend({ email: "a@uri.edu", nowMs: now + 60_000, stored, inFlight: false })).toBe(true);
  });

  it("maps rate-limit resend errors to a friendly message without leaking backend text", () => {
    const err = classifyAuthEmailProviderError(
      { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 },
      "resend",
    );
    expect(err.status).toBe(429);
    expect(err.message).toBe(AUTH_EMAIL_USER_MESSAGES.rateLimited);
    expect(err.message.toLowerCase()).not.toContain("supabase");

    const mapped = mapAuthEmailActionError(
      new HttpRequestError("SMTP password rejected at relay", "/api/auth/resend-confirmation", 400, "Bad", "RESEND_CONFIRMATION_FAILED"),
    );
    expect(mapped).toBe(AUTH_EMAIL_USER_MESSAGES.generic);
    expect(mapped.toLowerCase()).not.toContain("smtp");
  });
});

describe("invalid/expired verification links", () => {
  it("surfaces a recovery screen with a resend option", () => {
    const params = parseAuthCallbackParams({
      search: "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    });
    const recovery = mapAuthCallbackError(params);
    expect(recovery?.code).toBe("otp_expired");
    expect(shouldOfferVerificationResend(recovery)).toBe(true);
    expect(recovery?.message.toLowerCase()).not.toContain("token");
  });
});

describe("profile initialization race", () => {
  it("retries while auth exists and the profile is still initializing", () => {
    const error = { status: 404, code: "PROFILE_NOT_FOUND", message: "Profile not found." };
    expect(isProfileInitializingError(error)).toBe(true);
    expect(
      shouldContinueProfileReadyRetry({
        startedAtMs: 0,
        nowMs: 500,
        error,
        budgetMs: 10_000,
      }),
    ).toBe(true);
    expect(
      shouldContinueProfileReadyRetry({
        startedAtMs: 0,
        nowMs: 11_000,
        error,
        budgetMs: 10_000,
      }),
    ).toBe(false);
  });

  it("does not treat missing session as a half-authenticated retry", () => {
    const error = { status: 401, code: "UNAUTHORIZED", message: "Session expired. Please sign in again." };
    expect(isProfileInitializingError(error)).toBe(false);
  });
});

describe("access token claims", () => {
  it("reads email and session id without exposing the token", () => {
    const token = jwtFor({
      sub: "admin-1",
      email: ONBOARDING_QA_EMAIL,
      session_id: "sess-9",
    });
    expect(readAccessTokenClaims(token)).toEqual({
      sub: "admin-1",
      email: ONBOARDING_QA_EMAIL,
      sessionId: "sess-9",
      emailConfirmed: null,
    });
  });
});
