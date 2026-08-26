import { describe, expect, it, vi } from "vitest";
import {
  buildVerificationAdminEmailText,
  buildVerificationReviewUrl,
  getAdminVerificationEmails,
  notifyVerificationAdmins,
} from "@/lib/server/verificationMail";

describe("verification admin mail", () => {
  it("parses ADMIN_VERIFICATION_EMAILS without exposing a public env name", () => {
    expect(
      getAdminVerificationEmails({
        ADMIN_VERIFICATION_EMAILS: "one@campusquestapp.com, two@campusquestapp.com",
      }),
    ).toEqual(["one@campusquestapp.com", "two@campusquestapp.com"]);
  });

  it("builds a review email with a direct admin CTA", () => {
    const reviewUrl = buildVerificationReviewUrl("11111111-1111-4111-8111-111111111111", {
      NEXT_PUBLIC_SITE_URL: "https://campusquestapp.com",
    });
    expect(reviewUrl).toBe("https://campusquestapp.com/internal/admin/verification/11111111-1111-4111-8111-111111111111");
    const text = buildVerificationAdminEmailText({
      applicantName: "Nick Lockhart",
      applicantEmail: "nick@uri.edu",
      identityType: "student_business",
      requestedName: "Rhody Threads",
      submittedAt: "2026-08-25T18:00:00.000Z",
      description: "Campus streetwear.",
      reviewUrl,
    });
    expect(text).toContain("A new verification request is ready for review.");
    expect(text).toContain("Nick Lockhart");
    expect(text).toContain("nick@uri.edu");
    expect(text).toContain("Student Business");
    expect(text).toContain("Rhody Threads");
    expect(text).toContain("Review Application");
    expect(text).toContain(reviewUrl);
  });

  it("does not throw when sending fails and never logs the API key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const result = await notifyVerificationAdmins({
      requestId: "req-1",
      applicantName: "Nick Lockhart",
      applicantEmail: "nick@uri.edu",
      identityType: "organization",
      requestedName: "URI Entrepreneurship Club",
      submittedAt: "2026-08-25T18:00:00.000Z",
      description: "Student org.",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        ADMIN_VERIFICATION_EMAILS: "admin@campusquestapp.com",
        RESEND_API_KEY: "re_secret_test_key",
        NEXT_PUBLIC_SITE_URL: "https://campusquestapp.com",
      },
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("send_failed");
    const posted = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1];
    const body = JSON.parse(String(posted?.body ?? "{}")) as { subject?: string };
    expect(body.subject).toBe("New CampusQuest Verification Request");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("re_secret_test_key");
    warn.mockRestore();
  });

  it("returns a safe skip result when recipients or the API key are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      notifyVerificationAdmins({
        requestId: "req-2",
        applicantName: "Nick",
        applicantEmail: "nick@uri.edu",
        identityType: "student_business",
        requestedName: "Rhody Threads",
        submittedAt: "2026-08-25T18:00:00.000Z",
        description: "Campus streetwear.",
        env: { RESEND_API_KEY: "re_secret_test_key" },
      }),
    ).resolves.toMatchObject({ sent: false, reason: "missing_recipients" });
    await expect(
      notifyVerificationAdmins({
        requestId: "req-3",
        applicantName: "Nick",
        applicantEmail: "nick@uri.edu",
        identityType: "student_business",
        requestedName: "Rhody Threads",
        submittedAt: "2026-08-25T18:00:00.000Z",
        description: "Campus streetwear.",
        env: { ADMIN_VERIFICATION_EMAILS: "admin@campusquestapp.com" },
      }),
    ).resolves.toMatchObject({ sent: false, reason: "missing_key" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("re_secret_test_key");
    warn.mockRestore();
  });
});
