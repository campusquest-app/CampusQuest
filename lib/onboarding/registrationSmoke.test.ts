/**
 * Registration smoke — integrated onboarding state machine (no mocked “always succeed” APIs).
 * Proves the email-first → About You → Personalize → Ready path that production uses.
 *
 * Full HTTP/Supabase E2E is not wired in this repo (no Playwright). This suite is the
 * automated substitute that fails if the production interest/status deadlock returns.
 */
import { describe, expect, it } from "vitest";
import { isDemographicsComplete } from "@/lib/onboarding/demographicOnboardingPolicy";
import { resolveDemographicResumeStep } from "@/lib/onboarding/flow";
import {
  isInterestMinimumMet,
  personalizeContinueBlockReason,
  personalizeInterestCounterLabel,
  stepAfterCampusVerification,
  toggleInterestId,
} from "@/lib/onboarding/personalizeStep";
import type { InterestId } from "@/lib/onboarding/taxonomy";

describe("new student registration smoke (state machine)", () => {
  it("walks email-first signup through interests without the 4-selected deadlock", () => {
    // STEP 1–2: new unverified session enters campus OTP
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
        startAtEmailVerification: true,
      }),
    ).toBe("campus");

    // STEP 3: after verify, must collect About You (not Personalize with null status)
    const afterVerify = stepAfterCampusVerification({
      demographicsAlreadyComplete: false,
      studentStatus: null,
      graduationYear: null,
      interests: [],
    });
    expect(afterVerify).toBe("about_you");

    // STEP 4: About You complete → Personalize
    const studentStatus = "current_student" as const;
    const graduationYear = 2028;
    expect(
      stepAfterCampusVerification({
        demographicsAlreadyComplete: false,
        studentStatus,
        graduationYear,
        interests: [],
      }),
    ).toBe("personalize");

    // STEP 5: select exactly 3 interests — count, validation, continue agree
    let interests: InterestId[] = [];
    for (const id of ["athletics", "music", "tech"] as const) {
      interests = toggleInterestId(interests, id);
    }
    expect(personalizeInterestCounterLabel(interests)).toBe("3 selected");
    expect(isInterestMinimumMet(interests)).toBe(true);
    expect(personalizeContinueBlockReason({ studentStatus, interests })).toBeNull();

    // Regression: 4 selected must NOT surface as an interests error when status exists
    interests = toggleInterestId(interests, "fitness");
    expect(personalizeInterestCounterLabel(interests)).toBe("4 selected");
    expect(personalizeContinueBlockReason({ studentStatus, interests })).toBeNull();
    expect(personalizeContinueBlockReason({ studentStatus: null, interests })).toBe("missing_status");

    // STEP 6–7: demographics become complete after prefs + status + institution + verify
    expect(
      isDemographicsComplete({
        profile: {
          student_status: studentStatus,
          institution_id: "uri",
          campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        },
        preferences: { exists: true, interests, institutionId: "uri" },
      }),
    ).toBe(true);

    // STEP 8–9: resume after refresh stays off onboarding when complete + verified
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: studentStatus,
          institution_id: "uri",
          class_year: graduationYear,
          campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        },
        preferences: { exists: true, interests, institutionId: "uri" },
      }),
    ).toBe("ready");
  });

  it("double-toggle does not duplicate interest IDs", () => {
    let interests: InterestId[] = [];
    interests = toggleInterestId(interests, "athletics");
    interests = toggleInterestId(interests, "athletics");
    expect(interests).toEqual([]);
    interests = toggleInterestId(interests, "athletics");
    interests = toggleInterestId(interests, "athletics");
    interests = toggleInterestId(interests, "athletics");
    expect(interests).toEqual(["athletics"]);
  });
});
