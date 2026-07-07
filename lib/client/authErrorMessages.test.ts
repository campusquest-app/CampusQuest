import { describe, expect, it } from "vitest";
import {
  HttpRequestError,
  mapSigninError,
  mapSignupError,
} from "@/lib/client/authErrorMessages";

function httpError(status: number, message: string, code?: string) {
  return new HttpRequestError(message, "/api/auth/login", status, "Status", code);
}

describe("mapSigninError", () => {
  it("maps invalid credentials (401) to a clear reason", () => {
    expect(mapSigninError(httpError(401, "Invalid email or password.", "INVALID_CREDENTIALS"))).toBe(
      "Invalid email or password. If you just signed up, confirm your email first.",
    );
  });

  it("maps unconfirmed email before the generic 401 branch", () => {
    expect(
      mapSigninError(httpError(401, "Please confirm your URI email before signing in.", "EMAIL_NOT_CONFIRMED")),
    ).toBe("Please confirm your URI email before signing in.");
  });

  it("maps Supabase connection outages (503) to a connection message", () => {
    expect(mapSigninError(httpError(503, "Unable to connect. Please try again.", "AUTH_SERVICE_UNAVAILABLE"))).toBe(
      "Unable to connect. Please try again.",
    );
  });

  it("maps a missing profile row to a profile message instead of 'Unable to connect'", () => {
    expect(mapSigninError(httpError(404, "Profile not found after setup.", "PROFILE_NOT_FOUND"))).toBe(
      "We couldn't finish loading your profile. Please try signing in again in a moment.",
    );
  });

  it("does not leak raw server/config errors as 'Unable to connect'", () => {
    expect(mapSigninError(httpError(500, "Unexpected server error.", "INTERNAL_ERROR"))).toBe(
      "Something went wrong on our end. Please try again.",
    );
  });

  it("maps rate limiting to a wait message", () => {
    expect(mapSigninError(httpError(429, "Too many attempts.", "EMAIL_RATE_LIMIT"))).toBe(
      "Too many confirmation emails were sent. Please wait a few minutes before trying again.",
    );
  });

  it("treats a fetch/network failure as a connection issue", () => {
    expect(mapSigninError(new Error("NETWORK_ERROR:/api/auth/login"))).toBe("Unable to connect. Please try again.");
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
    ).toEqual({ message: "An account with this email already exists. Try signing in instead." });
  });

  it("maps network failures to a connection message", () => {
    expect(mapSignupError(new Error("NETWORK_ERROR:/api/auth/signup"))).toEqual({
      message: "Unable to connect. Please try again.",
    });
  });

  it("maps email rate limits to a confirmation-email message", () => {
    expect(mapSignupError(httpError(429, "Too many confirmation emails were sent.", "EMAIL_RATE_LIMIT"))).toEqual({
      message: "Too many confirmation emails were sent. Please wait a few minutes before trying again.",
    });
  });
});
