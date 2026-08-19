import { describe, expect, it } from "vitest";
import {
  isForeignKeyViolation,
  isTransientSetupError,
  nextBackoffMs,
  PLAYER_SETUP_TIMEOUT_MS,
} from "@/lib/server/playerSetup";
import { classifyProfileSetupError } from "@/lib/server/authBootstrap";
import { ApiError } from "@/lib/server/http";
import { mapSigninError, mapSignupError, HttpRequestError } from "@/lib/client/authErrorMessages";

describe("playerSetup backoff helpers", () => {
  it("uses exponential backoff capped at 2s", () => {
    expect(nextBackoffMs(1)).toBe(150);
    expect(nextBackoffMs(2)).toBe(300);
    expect(nextBackoffMs(3)).toBe(600);
    expect(nextBackoffMs(4)).toBe(1200);
    expect(nextBackoffMs(5)).toBe(2000);
    expect(nextBackoffMs(10)).toBe(2000);
  });

  it("budgets under typical serverless limits so signup can return recovery", () => {
    expect(PLAYER_SETUP_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(PLAYER_SETUP_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
  });

  it("detects foreign-key races against auth.users", () => {
    expect(isForeignKeyViolation({ code: "23503", message: "violates foreign key constraint" })).toBe(true);
    expect(
      isForeignKeyViolation({
        message: 'insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey"',
      }),
    ).toBe(true);
    expect(isForeignKeyViolation({ code: "23505", message: "duplicate key" })).toBe(false);
  });

  it("treats FK and connection blips as transient", () => {
    expect(isTransientSetupError({ code: "23503" })).toBe(true);
    expect(isTransientSetupError({ message: "fetch failed" })).toBe(true);
    expect(isTransientSetupError({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("classifyProfileSetupError", () => {
  it("preserves pending readiness errors without asking users to retry signup", () => {
    const err = classifyProfileSetupError(
      new ApiError(503, "We're still finishing your account setup.", "PLAYER_SETUP_PENDING"),
    );
    expect(err.code).toBe("PLAYER_SETUP_PENDING");
    expect(err.status).toBe(503);
    expect(err.message.toLowerCase()).not.toContain("not available yet");
  });

  it("maps username conflicts to USERNAME_TAKEN", () => {
    const err = classifyProfileSetupError(
      new ApiError(400, 'duplicate key value violates unique constraint "profiles_username_key"', "PROFILE_SETUP_FAILED"),
    );
    expect(err.code).toBe("USERNAME_TAKEN");
  });

  it("maps permanent setup failures after auth to AUTH_CREATED_SETUP_PENDING", () => {
    const err = classifyProfileSetupError(
      new ApiError(400, "column student_status does not exist", "PROFILE_SETUP_FAILED"),
    );
    expect(err.code).toBe("AUTH_CREATED_SETUP_PENDING");
    expect(err.message.toLowerCase()).toContain("finishing");
  });

  it("does not treat profiles_pkey duplicates as USERNAME_TAKEN", () => {
    const err = classifyProfileSetupError(
      new ApiError(400, 'duplicate key value violates unique constraint "profiles_pkey"', "PROFILE_SETUP_FAILED"),
    );
    expect(err.code).toBe("AUTH_CREATED_SETUP_PENDING");
  });
});

describe("auth error message mapping", () => {
  it("maps signup pending setup to a finishing message", () => {
    const mapped = mapSignupError(
      new HttpRequestError(
        "We're still finishing your account setup. Please wait a moment and try signing in.",
        "/api/auth/signup",
        503,
        "Service Unavailable",
        "PLAYER_SETUP_PENDING",
      ),
    );
    expect("message" in mapped && mapped.message.toLowerCase()).toContain("finishing");
    expect("recoverSignIn" in mapped && mapped.recoverSignIn).toBe(true);
    expect("message" in mapped && mapped.message.toLowerCase()).not.toContain("not available yet");
  });

  it("maps sign-in pending profile to finishing copy instead of a hard failure", () => {
    const message = mapSigninError(
      new HttpRequestError(
        "We're still creating your profile. Please wait a moment and try signing in.",
        "/api/auth/login",
        503,
        "Service Unavailable",
        "PROFILE_SETUP_PENDING",
      ),
    );
    expect(message.toLowerCase()).toContain("creating your profile");
    expect(message.toLowerCase()).not.toContain("not available yet");
  });
});
