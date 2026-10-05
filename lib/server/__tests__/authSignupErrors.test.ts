import { describe, expect, it } from "vitest";
import {
  classifyProfileSetupError,
  classifySupabaseSignupError,
} from "../authBootstrap";
import { ApiError } from "../http";

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
