import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/http";
import {
  isEmailAlreadyExistsError,
  isPendingPlayerSetupCode,
  recoverExistingSignupEmail,
  SIGNUP_AUTH_CREATED_SETUP_PENDING,
  toAuthCreatedSetupPendingError,
} from "@/lib/server/signupRecovery";
import { mapSignupError, HttpRequestError } from "@/lib/client/authErrorMessages";
import { classifyProfileSetupError } from "@/lib/server/authBootstrap";

vi.mock("@/lib/featureFlags", () => ({
  FEATURE_FLAGS: { requireEmailVerification: false },
}));

vi.mock("@/lib/server/authBootstrap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/authBootstrap")>();
  return {
    ...actual,
    findAuthUserIdByEmail: vi.fn(),
    confirmEmailAndSignIn: vi.fn(),
    logAuthFlow: vi.fn(),
    logAuthError: vi.fn(),
  };
});

vi.mock("@/lib/server/playerSetup", () => ({
  ensurePlayerSetup: vi.fn(),
}));

import { confirmEmailAndSignIn, findAuthUserIdByEmail } from "@/lib/server/authBootstrap";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";

const findAuthUserIdByEmailMock = vi.mocked(findAuthUserIdByEmail);
const confirmEmailAndSignInMock = vi.mocked(confirmEmailAndSignIn);
const ensurePlayerSetupMock = vi.mocked(ensurePlayerSetup);

function httpError(status: number, message: string, code?: string) {
  return new HttpRequestError(message, "/api/auth/signup", status, "Status", code);
}

function mockPublicClient(signInResult: {
  user?: { id: string; email?: string } | null;
  session?: { access_token: string } | null;
  error?: { message?: string; code?: string } | null;
}) {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: {
          user: signInResult.user ?? null,
          session: signInResult.session ?? null,
        },
        error: signInResult.error ?? null,
      })),
    },
  } as never;
}

describe("signup recovery helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects email-already-exists errors", () => {
    expect(isEmailAlreadyExistsError(new ApiError(409, "exists", "EMAIL_ALREADY_EXISTS"))).toBe(true);
    expect(isEmailAlreadyExistsError(new ApiError(400, "nope", "SIGNUP_FAILED"))).toBe(false);
  });

  it("detects pending setup codes including AUTH_CREATED_SETUP_PENDING", () => {
    expect(isPendingPlayerSetupCode("AUTH_CREATED_SETUP_PENDING")).toBe(true);
    expect(isPendingPlayerSetupCode("PLAYER_SETUP_PENDING")).toBe(true);
    expect(isPendingPlayerSetupCode("USERNAME_TAKEN")).toBe(false);
  });

  it("converts pending setup failures to AUTH_CREATED_SETUP_PENDING", () => {
    const err = toAuthCreatedSetupPendingError(
      new ApiError(503, "We're still creating your profile.", "PROFILE_SETUP_PENDING"),
    );
    expect(err.code).toBe(SIGNUP_AUTH_CREATED_SETUP_PENDING);
    expect(err.message).toMatch(/finishing your account setup/i);
  });

  it("preserves USERNAME_TAKEN after auth create", () => {
    const err = toAuthCreatedSetupPendingError(new ApiError(409, "taken", "USERNAME_TAKEN"));
    expect(err.code).toBe("USERNAME_TAKEN");
  });
});

describe("recoverExistingSignupEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers an existing confirmed account via password login + ensurePlayerSetup", async () => {
    const client = mockPublicClient({
      user: { id: "u1", email: "student@uri.edu" },
      session: { access_token: "tok" },
    });
    ensurePlayerSetupMock.mockResolvedValue({
      profile: { id: "u1", username: "student" },
      stats: { user_id: "u1", total_xp: 0 },
    } as never);

    const result = await recoverExistingSignupEmail({
      publicClient: client,
      email: "student@uri.edu",
      password: "Password1!",
      username: "student",
    });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.source).toBe("existing_password_login");
      expect(result.user.id).toBe("u1");
    }
    expect(ensurePlayerSetupMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", username: "student" }),
    );
  });

  it("heals missing profile/stats on existing login", async () => {
    const client = mockPublicClient({
      user: { id: "u2", email: "heal@uri.edu" },
      session: { access_token: "tok" },
    });
    ensurePlayerSetupMock.mockResolvedValue({
      profile: { id: "u2", username: "heal" },
      stats: { user_id: "u2", total_xp: 0 },
    } as never);

    const result = await recoverExistingSignupEmail({
      publicClient: client,
      email: "heal@uri.edu",
      password: "Password1!",
    });
    expect(result.kind).toBe("ready");
  });

  it("surfaces AUTH_CREATED_SETUP_PENDING when login works but setup is still pending", async () => {
    const client = mockPublicClient({
      user: { id: "u3", email: "pending@uri.edu" },
      session: { access_token: "tok" },
    });
    ensurePlayerSetupMock.mockRejectedValue(
      new ApiError(503, "We're still creating your profile.", "PROFILE_SETUP_PENDING"),
    );

    await expect(
      recoverExistingSignupEmail({
        publicClient: client,
        email: "pending@uri.edu",
        password: "Password1!",
      }),
    ).rejects.toMatchObject({ code: SIGNUP_AUTH_CREATED_SETUP_PENDING, status: 503 });
  });

  it("recovers unconfirmed accounts via confirmEmailAndSignIn when verification flag is off", async () => {
    const client = mockPublicClient({
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });
    findAuthUserIdByEmailMock.mockResolvedValue("u4");
    confirmEmailAndSignInMock.mockResolvedValue({
      ok: true,
      user: { id: "u4", email: "new@uri.edu" },
      session: { access_token: "tok" },
    } as never);
    ensurePlayerSetupMock.mockResolvedValue({
      profile: { id: "u4", username: "new" },
      stats: { user_id: "u4" },
    } as never);

    const result = await recoverExistingSignupEmail({
      publicClient: client,
      email: "new@uri.edu",
      password: "Password1!",
      displayName: "New",
    });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.source).toBe("existing_auto_confirm");
    }
  });

  it("returns EMAIL_ALREADY_EXISTS when password is wrong for an existing account", async () => {
    const client = mockPublicClient({
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    findAuthUserIdByEmailMock.mockResolvedValue("u5");
    confirmEmailAndSignInMock.mockResolvedValue({ ok: false } as never);

    const result = await recoverExistingSignupEmail({
      publicClient: client,
      email: "exists@uri.edu",
      password: "WrongPassword1!",
    });

    expect(result.kind).toBe("unrecoverable");
    if (result.kind === "unrecoverable") {
      expect(result.error.code).toBe("EMAIL_ALREADY_EXISTS");
    }
  });
});

describe("mapSignupError recovery UX", () => {
  it("routes AUTH_CREATED_SETUP_PENDING to recoverSignIn (not Create Account retry)", () => {
    expect(
      mapSignupError(
        httpError(
          503,
          "We're finishing your account setup. Please wait a moment, then try signing in.",
          "AUTH_CREATED_SETUP_PENDING",
        ),
      ),
    ).toEqual({
      message: "We're finishing your account setup. Please wait a moment, then try signing in.",
      recoverSignIn: true,
    });
  });

  it("routes EMAIL_ALREADY_EXISTS to recoverSignIn", () => {
    expect(
      mapSignupError(
        httpError(409, "An account with this email already exists. Try signing in instead.", "EMAIL_ALREADY_EXISTS"),
      ),
    ).toEqual({
      message: "An account with this email already exists. Try signing in instead.",
      recoverSignIn: true,
    });
  });

  it("routes request timeouts after possible backend success to recoverSignIn", () => {
    expect(mapSignupError(new Error("REQUEST_TIMEOUT:/api/auth/signup"))).toEqual({
      message: "We're finishing your account setup. Please wait a moment, then try signing in.",
      recoverSignIn: true,
    });
  });

  it("keeps USERNAME_TAKEN on the signup form", () => {
    expect(mapSignupError(httpError(409, "This username is already taken.", "USERNAME_TAKEN"))).toEqual({
      message: "This username is already taken.",
    });
  });

  it("maps verification-required to check-email recoverSignIn", () => {
    expect(mapSignupError(httpError(200, "Confirm email", "SIGNUP_VERIFICATION_REQUIRED"))).toEqual({
      message: "Check your URI email to confirm your account before signing in.",
      recoverSignIn: true,
      verificationRequired: true,
    });
  });
});

describe("signup + onboarding demographics compatibility", () => {
  it("does not treat demographics columns as username conflicts", () => {
    const err = classifyProfileSetupError(
      new ApiError(400, "null value in column student_status violates not-null constraint", "PROFILE_SETUP_FAILED"),
    );
    // Remapped to recoverable auth-created pending (not USERNAME_TAKEN).
    expect(err.code).toBe("AUTH_CREATED_SETUP_PENDING");
  });

  it("keeps pending readiness codes distinct before AUTH_CREATED remapping", () => {
    expect(
      classifyProfileSetupError(new ApiError(503, "pending", "STATS_SETUP_PENDING")).code,
    ).toBe("STATS_SETUP_PENDING");
  });
});
