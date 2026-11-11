import { describe, expect, it } from "vitest";
import {
  buildPasswordResetEmailText,
  isUnknownAuthUserError,
  sendPasswordResetEmailViaResend,
} from "@/lib/server/passwordResetMail";

describe("password reset email", () => {
  it("sends a one-time link from the authenticated CampusQuest address", async () => {
    const link = "https://example.supabase.co/auth/v1/verify?token=secret&type=recovery&redirect_to=https%3A%2F%2Fcampusquestapp.com%2Fauth%2Freset-password";
    let body = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await sendPasswordResetEmailViaResend({
      to: "student@uri.edu",
      link,
      fetchImpl,
      env: { RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "CampusQuest <noreply@auth.campusquestapp.com>" },
    });

    const parsed = JSON.parse(body) as { from: string; subject: string; text: string };
    expect(parsed.from).toBe("CampusQuest <noreply@auth.campusquestapp.com>");
    expect(parsed.subject).toBe("Reset your CampusQuest password");
    expect(parsed.text).toContain(link);
    expect(parsed.text).toMatch(/works once/i);
    expect(buildPasswordResetEmailText(link)).not.toMatch(/password is/i);
  });

  it("treats a missing account as a non-event", () => {
    expect(isUnknownAuthUserError({ code: "user_not_found" })).toBe(true);
    expect(isUnknownAuthUserError({ message: "User not found" })).toBe(true);
    expect(isUnknownAuthUserError({ message: "rate limit" })).toBe(false);
  });
});
