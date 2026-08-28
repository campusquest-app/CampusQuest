import { describe, expect, it } from "vitest";
import {
  shouldAutoEstablishSignupSession,
  shouldKeepSignupPassword,
} from "@/lib/client/signupSessionContinuity";

describe("signup session continuity", () => {
  it("auto-establishes a session when signup returns no token and email confirm is not required", () => {
    expect(
      shouldAutoEstablishSignupSession({
        hasAccessToken: false,
        verificationRequired: false,
        recoverSignIn: true,
        errorCode: "AUTH_CREATED_SETUP_PENDING",
      }),
    ).toBe(true);
  });

  it("does not auto-login when email confirmation is required", () => {
    expect(
      shouldAutoEstablishSignupSession({
        hasAccessToken: false,
        verificationRequired: true,
        recoverSignIn: true,
      }),
    ).toBe(false);
  });

  it("does not auto-login an existing account with a likely wrong password", () => {
    expect(
      shouldAutoEstablishSignupSession({
        hasAccessToken: false,
        verificationRequired: false,
        recoverSignIn: true,
        errorCode: "EMAIL_ALREADY_EXISTS",
      }),
    ).toBe(false);
    expect(shouldKeepSignupPassword({ verificationRequired: false, errorCode: "EMAIL_ALREADY_EXISTS" })).toBe(false);
    expect(shouldKeepSignupPassword({ verificationRequired: false, errorCode: "AUTH_CREATED_SETUP_PENDING" })).toBe(
      true,
    );
  });
});
