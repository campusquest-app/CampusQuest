import { describe, expect, it } from "vitest";
import {
  classifyProfileSetupError,
  classifySupabaseSignupError,
  isRecoverableSignupAuthError,
  shouldFallbackToAdminSignup,
} from "../authBootstrap";
import { ApiError } from "../http";

describe("isRecoverableSignupAuthError", () => {
  it("treats email rate limits as recoverable when Supabase still created the user", () => {
    expect(
      isRecoverableSignupAuthError({
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
      }),
    ).toBe(true);
  });

  it("treats confirmation email send failures as recoverable", () => {
    expect(
      isRecoverableSignupAuthError({
        message: "Error sending confirmation email",
      }),
    ).toBe(true);
  });

  it("does not treat unknown auth failures as recoverable", () => {
    expect(
      isRecoverableSignupAuthError({
        code: "signup_disabled",
        message: "Signups not allowed for this instance",
      }),
    ).toBe(false);
  });
});

describe("shouldFallbackToAdminSignup", () => {
  it("falls back when email delivery fails before a user is created", () => {
    expect(
      shouldFallbackToAdminSignup(
        { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
        false,
      ),
    ).toBe(true);
  });

  it("does not fall back when signUp already created the user", () => {
    expect(
      shouldFallbackToAdminSignup(
        { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
        true,
      ),
    ).toBe(false);
  });
});

describe("classifySupabaseSignupError", () => {
  it("maps rate limits to EMAIL_RATE_LIMIT", () => {
    const err = classifySupabaseSignupError({
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
    });
    expect(err.code).toBe("EMAIL_RATE_LIMIT");
    expect(err.status).toBe(429);
  });

  it("maps duplicate email to EMAIL_ALREADY_EXISTS", () => {
    const err = classifySupabaseSignupError({
      message: "User already registered",
    });
    expect(err.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(err.status).toBe(409);
  });

  it("maps invalid email to INVALID_EMAIL", () => {
    const err = classifySupabaseSignupError({
      message: "Email address is invalid",
    });
    expect(err.code).toBe("INVALID_EMAIL");
  });
});

describe("classifyProfileSetupError", () => {
  it("maps username conflicts to USERNAME_TAKEN", () => {
    const err = classifyProfileSetupError(
      new ApiError(400, 'duplicate key value violates unique constraint "profiles_username_key"', "PROFILE_SETUP_FAILED"),
    );
    expect(err.code).toBe("USERNAME_TAKEN");
    expect(err.status).toBe(409);
  });
});
