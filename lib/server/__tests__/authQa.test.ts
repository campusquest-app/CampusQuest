import { describe, expect, it } from "vitest";
import { isAllowedAuthQaTargetEmail } from "@/lib/server/authQa";
import { ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";

describe("Auth QA target restrictions", () => {
  it("allows the signed-in admin to email themselves", () => {
    expect(
      isAllowedAuthQaTargetEmail({
        targetEmail: ONBOARDING_QA_EMAIL,
        adminEmail: ONBOARDING_QA_EMAIL,
      }),
    ).toBe(true);
  });

  it("allows URI and dedicated QA signup emails, not arbitrary inboxes", () => {
    expect(
      isAllowedAuthQaTargetEmail({
        targetEmail: "student@uri.edu",
        adminEmail: ONBOARDING_QA_EMAIL,
      }),
    ).toBe(true);
    expect(
      isAllowedAuthQaTargetEmail({
        targetEmail: "qa_signup@campusquestapp.com",
        adminEmail: ONBOARDING_QA_EMAIL,
      }),
    ).toBe(true);
    expect(
      isAllowedAuthQaTargetEmail({
        targetEmail: "stranger@gmail.com",
        adminEmail: ONBOARDING_QA_EMAIL,
      }),
    ).toBe(false);
  });
});
