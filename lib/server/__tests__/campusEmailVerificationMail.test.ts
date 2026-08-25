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
      async (_url: string | URL, init?: RequestInit) => new Response("nope", { status: 500 }),
    );
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
    };
    expect(body.subject).toBe("Your CampusQuest verification code");
    expect(body.text).toContain("482913");
  });
});
