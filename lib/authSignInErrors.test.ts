import { describe, expect, it } from "vitest";
import {
  SIGNIN_USER_MESSAGES,
  classifySupabaseSignInFailure,
  isExplicitEmailNotConfirmedError,
} from "@/lib/authSignInErrors";

/**
 * Matrix covering the user-requested sign-in cases.
 * (Successful login is the absence of an AuthError from signInWithPassword.)
 */
describe("sign-in auth error matrix", () => {
  it("correct email + wrong password → Incorrect email or password", () => {
    const failure = classifySupabaseSignInFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 400,
    });
    expect(failure.message).toBe("Incorrect email or password.");
    expect(failure.code).toBe("INVALID_CREDENTIALS");
    expect(isExplicitEmailNotConfirmedError(failure)).toBe(false);
  });

  it("nonexistent email + password → same credentials message (no existence leak)", () => {
    const failure = classifySupabaseSignInFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 400,
    });
    expect(failure.message).toBe(SIGNIN_USER_MESSAGES.invalidCredentials);
  });

  it("unconfirmed email + correct password (explicit code) → confirmation message", () => {
    const failure = classifySupabaseSignInFailure({
      message: "Email not confirmed",
      code: "email_not_confirmed",
      status: 400,
    });
    expect(failure.message).toBe(SIGNIN_USER_MESSAGES.emailNotConfirmed);
    expect(failure.code).toBe("EMAIL_NOT_CONFIRMED");
  });

  it("unconfirmed email + wrong password when Supabase returns email_not_confirmed → confirmation message", () => {
    // GoTrue often returns email_not_confirmed before evaluating the password.
    const failure = classifySupabaseSignInFailure({
      message: "Email not confirmed",
      code: "email_not_confirmed",
      status: 400,
    });
    expect(failure.message).toBe(SIGNIN_USER_MESSAGES.emailNotConfirmed);
  });

  it("unconfirmed email + wrong password when Supabase returns invalid_credentials → credentials message", () => {
    const failure = classifySupabaseSignInFailure({
      message: "Invalid login credentials",
      code: "invalid_credentials",
      status: 400,
    });
    expect(failure.message).toBe(SIGNIN_USER_MESSAGES.invalidCredentials);
  });

  it("HTTP 429 → rate-limit message", () => {
    const failure = classifySupabaseSignInFailure({
      message: "Too many requests",
      code: "over_request_rate_limit",
      status: 429,
    });
    expect(failure.message).toBe(SIGNIN_USER_MESSAGES.rateLimited);
    expect(failure.status).toBe(429);
  });

  it("network error → connectivity message", () => {
    const failure = classifySupabaseSignInFailure({
      message: "fetch failed",
      code: "",
    });
    expect(failure.message).toBe(SIGNIN_USER_MESSAGES.network);
  });

  it("legacy bad copy containing 'confirm your email' with INVALID_CREDENTIALS is NOT confirmation", () => {
    expect(
      isExplicitEmailNotConfirmedError({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password. If you just signed up, confirm your email first.",
      }),
    ).toBe(false);
    expect(
      classifySupabaseSignInFailure({
        message: "Invalid email or password. If you just signed up, confirm your email first.",
        code: "INVALID_CREDENTIALS",
        status: 401,
      }).message,
    ).toBe(SIGNIN_USER_MESSAGES.invalidCredentials);
  });
});
