import { describe, expect, it } from "vitest";
import {
  SIGNIN_USER_MESSAGES,
  classifySupabaseSignInFailure,
  isExplicitEmailNotConfirmedError,
} from "@/lib/authSignInErrors";
import {
  HttpRequestError,
  mapSigninError,
  mapSignupError,
} from "@/lib/client/authErrorMessages";

function httpError(status: number, message: string, code?: string) {
  return new HttpRequestError(message, "/api/auth/login", status, "Status", code);
}

describe("isExplicitEmailNotConfirmedError", () => {
  it("accepts explicit Supabase code", () => {
    expect(isExplicitEmailNotConfirmedError({ code: "email_not_confirmed", message: "Email not confirmed" })).toBe(
      true,
    );
  });

  it("accepts exact Supabase message", () => {
    expect(isExplicitEmailNotConfirmedError({ code: null, message: "Email not confirmed" })).toBe(true);
  });

  it("does NOT treat credential hint copy as unconfirmed", () => {
    expect(
      isExplicitEmailNotConfirmedError({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password. If you just signed up, confirm your email first.",
      }),
    ).toBe(false);
  });

  it("does NOT treat generic failures as unconfirmed", () => {
    expect(
      isExplicitEmailNotConfirmedError({
        code: "invalid_credentials",
        message: "Invalid login credentials",
      }),
    ).toBe(false);
  });
});

describe("classifySupabaseSignInFailure", () => {
  it("maps correct-password-shape invalid credentials", () => {
    expect(
      classifySupabaseSignInFailure({
        message: "Invalid login credentials",
        code: "invalid_credentials",
        status: 400,
      }),
    ).toEqual({
      status: 401,
      message: SIGNIN_USER_MESSAGES.invalidCredentials,
      code: "INVALID_CREDENTIALS",
    });
  });

  it("maps nonexistent email the same as wrong password (no account leak)", () => {
    const a = classifySupabaseSignInFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 400,
    });
    const b = classifySupabaseSignInFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 400,
    });
    expect(a.message).toBe(b.message);
    expect(a.message).toBe("Incorrect email or password.");
  });

  it("maps explicit unconfirmed email", () => {
    expect(
      classifySupabaseSignInFailure({
        message: "Email not confirmed",
        code: "email_not_confirmed",
        status: 400,
      }),
    ).toEqual({
      status: 401,
      message: SIGNIN_USER_MESSAGES.emailNotConfirmed,
      code: "EMAIL_NOT_CONFIRMED",
    });
  });

  it("maps rate limits", () => {
    expect(
      classifySupabaseSignInFailure({
        message: "Request rate limit reached",
        code: "over_request_rate_limit",
        status: 429,
      }),
    ).toEqual({
      status: 429,
      message: SIGNIN_USER_MESSAGES.rateLimited,
      code: "RATE_LIMITED",
    });
  });

  it("maps network failures", () => {
    expect(classifySupabaseSignInFailure({ message: "fetch failed", code: "fetch" })).toEqual({
      status: 503,
      message: SIGNIN_USER_MESSAGES.network,
      code: "AUTH_SERVICE_UNAVAILABLE",
    });
  });
});

describe("mapSigninError", () => {
  it("maps wrong password (API INVALID_CREDENTIALS) without email confirmation warning", () => {
    expect(
      mapSigninError(httpError(401, SIGNIN_USER_MESSAGES.invalidCredentials, "INVALID_CREDENTIALS")),
    ).toBe("Incorrect email or password.");
  });

  it("never remaps legacy credential copy that mentioned confirmation", () => {
    expect(
      mapSigninError(
        httpError(
          401,
          "Invalid email or password. If you just signed up, confirm your email first.",
          "INVALID_CREDENTIALS",
        ),
      ),
    ).toBe("Incorrect email or password.");
  });

  it("maps nonexistent / wrong credentials the same", () => {
    expect(mapSigninError(httpError(401, "Incorrect email or password.", "INVALID_CREDENTIALS"))).toBe(
      mapSigninError(httpError(401, "Invalid login credentials", "invalid_credentials")),
    );
  });

  it("maps unconfirmed email only for EMAIL_NOT_CONFIRMED", () => {
    expect(
      mapSigninError(httpError(401, SIGNIN_USER_MESSAGES.emailNotConfirmed, "EMAIL_NOT_CONFIRMED")),
    ).toBe("Please confirm your URI email before signing in.");
  });

  it("maps Supabase connection outages (503) to a connection message", () => {
    expect(mapSigninError(httpError(503, "Unable to connect. Please try again.", "AUTH_SERVICE_UNAVAILABLE"))).toBe(
      SIGNIN_USER_MESSAGES.network,
    );
  });

  it("maps a missing profile row to a finishing-setup message instead of a credential error", () => {
    expect(mapSigninError(httpError(404, "Profile not found after setup.", "PROFILE_NOT_FOUND"))).toBe(
      "We're finishing your account. Hang tight — this only takes a moment.",
    );
  });

  it("maps pending profile setup (503) to the finishing message", () => {
    expect(
      mapSigninError(
        httpError(
          503,
          "We're still creating your profile. Please wait a moment and try signing in.",
          "PROFILE_SETUP_PENDING",
        ),
      ),
    ).toBe("We're finishing your account. Hang tight — this only takes a moment.");
  });

  it("maps server errors without leaking raw text", () => {
    expect(mapSigninError(httpError(500, "Unexpected server error.", "INTERNAL_ERROR"))).toBe(
      SIGNIN_USER_MESSAGES.server,
    );
  });

  it("maps HTTP 429 to sign-in rate-limit copy", () => {
    expect(mapSigninError(httpError(429, "Too many attempts.", "RATE_LIMITED"))).toBe(
      SIGNIN_USER_MESSAGES.rateLimited,
    );
  });

  it("treats a fetch/network failure as a connection issue", () => {
    expect(mapSigninError(new Error("NETWORK_ERROR:/api/auth/login"))).toBe(SIGNIN_USER_MESSAGES.network);
  });

  it("maps other auth failures to the generic sign-in message", () => {
    expect(mapSigninError(httpError(403, "Forbidden", "SOME_OTHER_ERROR"))).toBe(SIGNIN_USER_MESSAGES.generic);
  });
});

describe("mapSignupError", () => {
  it("flags password-requirement failures", () => {
    expect(mapSignupError(httpError(400, "Password too weak", "PASSWORD_REQUIREMENTS"))).toEqual({
      passwordRequirements: true,
    });
  });

  it("passes through a clean server message (duplicate email)", () => {
    expect(
      mapSignupError(
        httpError(409, "An account with this email already exists. Try signing in instead.", "EMAIL_ALREADY_EXISTS"),
      ),
    ).toEqual({
      message: "An account with this email already exists. Try signing in instead.",
      recoverSignIn: true,
    });
  });

  it("maps network failures to a connection message", () => {
    expect(mapSignupError(new Error("NETWORK_ERROR:/api/auth/signup"))).toEqual({
      message: SIGNIN_USER_MESSAGES.network,
    });
  });

  it("maps email rate limits to a confirmation-email message", () => {
    expect(mapSignupError(httpError(429, "Too many confirmation emails were sent.", "EMAIL_RATE_LIMIT"))).toEqual({
      message: "Too many confirmation emails were sent. Please wait a few minutes before trying again.",
    });
  });

  it("does not leak raw Supabase/Postgres signup failures", () => {
    expect(
      mapSignupError(
        httpError(500, 'duplicate key value violates unique constraint "profiles_pkey"', "PROFILE_SETUP_FAILED"),
      ),
    ).toEqual({
      message: "We're finishing your account. Hang tight — this only takes a moment.",
      recoverSignIn: true,
    });
    expect(
      mapSignupError(httpError(400, "JWT expired: supabase auth exception", "UNKNOWN")),
    ).toEqual({ message: "Unable to create your account. Please try again." });
  });

  it("moves AUTH_CREATED_SETUP_PENDING off Create Account via recoverSignIn", () => {
    expect(
      mapSignupError(
        httpError(
          503,
          "We're finishing your account setup. Please wait a moment, then try signing in.",
          "AUTH_CREATED_SETUP_PENDING",
        ),
      ),
    ).toEqual({
      message: "We're finishing your account. Hang tight — this only takes a moment.",
      recoverSignIn: true,
    });
  });
});
