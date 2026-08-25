import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/http";
import {
  buildCampusVerificationEmailText,
  getResendApiKey,
  sendCampusVerificationEmailViaResend,
} from "@/lib/server/campusEmailVerificationMail";

describe("campus verification mail", () => {
  it("fails loudly when RESEND_API_KEY is missing", () => {
    expect(() => getResendApiKey({})).toThrow(ApiError);
  });

  it("builds a code email without localhost links", () => {
    const text = buildCampusVerificationEmailText("482913");
    expect(text).toContain("482913");
    expect(text).toContain("CampusQuest");
    expect(text).toMatch(/10 minutes/);
    expect(text.toLowerCase()).not.toContain("localhost");
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("posts to Resend without logging the code in the failure payload", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            name: "validation_error",
            message: "The campusquestapp.com domain is not verified.",
            statusCode: 403,
          }),
          { status: 403 },
        ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      sendCampusVerificationEmailViaResend({
        to: "student@uri.edu",
        code: "482913",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        env: { RESEND_API_KEY: "re_test" },
      }),
    ).rejects.toMatchObject({ message: "We couldn't send your code. Please try again." });
    const posted = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(posted && "body" in posted ? posted.body : "{}")) as {
      subject?: string;
      text?: string;
      from?: string;
    };
    expect(body.subject).toBe("Your CampusQuest verification code");
    expect(body.text).toContain("482913");
    expect(body.from).toBe("CampusQuest <noreply@auth.campusquestapp.com>");
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(logged).toMatchObject({
      httpStatus: 403,
      resendErrorName: "validation_error",
      recipientDomain: "uri.edu",
      from: "CampusQuest <noreply@auth.campusquestapp.com>",
    });
    expect(JSON.stringify(logged)).not.toContain("482913");
    expect(JSON.stringify(logged)).not.toContain("re_test");
    warn.mockRestore();
  });

  it("uses RESEND_FROM_EMAIL override when provided", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "email_123" }), { status: 200 }),
    );
    await sendCampusVerificationEmailViaResend({
      to: "student@uri.edu",
      code: "482913",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        RESEND_API_KEY: "re_test",
        RESEND_FROM_EMAIL: "CampusQuest <custom@auth.campusquestapp.com>",
      },
    });
    const posted = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(posted?.body ?? "{}")) as {
      from?: string;
    };
    expect(body.from).toBe("CampusQuest <custom@auth.campusquestapp.com>");
  });
});
