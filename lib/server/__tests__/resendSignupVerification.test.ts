import { describe, expect, it, vi } from "vitest";
import { CAMPUS_EMAIL_USER_MESSAGES } from "@/lib/campusEmailVerification";
import { ApiError } from "@/lib/server/http";
import {
  decideResendVerification,
  deliverCampusVerificationForExistingUser,
  isSupabaseSignupAlreadyConfirmedError,
} from "@/lib/server/resendSignupVerification";

describe("Supabase confirmation resend", () => {
  it("treats an already-confirmed Auth user as a campus-code resend", () => {
    expect(isSupabaseSignupAlreadyConfirmedError({ message: "Email address already confirmed" })).toBe(
      true,
    );
    expect(decideResendVerification({ message: "Email address already confirmed", status: 400 }).kind).toBe(
      "send_campus_code",
    );
  });

  it("keeps a successful Supabase resend on the confirmation-link path", () => {
    expect(decideResendVerification(null).kind).toBe("supabase_confirmation_accepted");
  });

  it("surfaces provider rate limits instead of claiming an email was sent", () => {
    const decision = decideResendVerification({
      status: 429,
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
    });
    expect(decision.kind).toBe("reject");
    if (decision.kind === "reject") {
      expect(decision.error.status).toBe(429);
      expect(decision.error.message.toLowerCase()).not.toContain("supabase");
    }
  });

  it("sends the URI code for a confirmed student and reports delivery", async () => {
    const sendCode = vi.fn(async () => ({ alreadyVerified: false, resendAvailableInSeconds: 60 }));
    const result = await deliverCampusVerificationForExistingUser({
      email: "cam.lindberg@uri.edu",
      lookupUserId: async () => "user-1",
      sendCode,
    });
    expect(sendCode).toHaveBeenCalledWith({ userId: "user-1", email: "cam.lindberg@uri.edu" });
    expect(result).toMatchObject({
      delivered: true,
      alreadyVerified: false,
      channel: "campus_code",
      message: CAMPUS_EMAIL_USER_MESSAGES.sent,
    });
  });

  it("does not pretend a code was sent when the URI address is already verified", async () => {
    const result = await deliverCampusVerificationForExistingUser({
      email: "student@uri.edu",
      lookupUserId: async () => "user-1",
      sendCode: async () => ({ alreadyVerified: true, resendAvailableInSeconds: 0 }),
    });
    expect(result.delivered).toBe(false);
    expect(result.alreadyVerified).toBe(true);
    expect(result.message).toBe(CAMPUS_EMAIL_USER_MESSAGES.alreadyVerified);
  });

  it("rejects non-URI addresses without sending", async () => {
    const sendCode = vi.fn();
    await expect(
      deliverCampusVerificationForExistingUser({
        email: "student@gmail.com",
        lookupUserId: async () => "user-1",
        sendCode,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_DOMAIN" });
    expect(sendCode).not.toHaveBeenCalled();
  });

  it("fails closed when the confirmed user cannot be found", async () => {
    await expect(
      deliverCampusVerificationForExistingUser({
        email: "student@uri.edu",
        lookupUserId: async () => null,
        sendCode: async () => ({ alreadyVerified: false, resendAvailableInSeconds: 60 }),
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
