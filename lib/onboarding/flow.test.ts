import { describe, expect, it } from "vitest";
import {
  DEMOGRAPHIC_ONBOARDING_STEPS,
  canonicalizeDemographicStep,
  demographicProgress,
  demographicStepsForUser,
  nextDemographicStep,
  previousDemographicStep,
  resolveDemographicResumeStep,
} from "@/lib/onboarding/flow";

describe("demographic onboarding order", () => {
  it("uses four required screens after the logged-out welcome", () => {
    expect(DEMOGRAPHIC_ONBOARDING_STEPS).toEqual([
      "welcome",
      "about_you",
      "campus",
      "personalize",
      "ready",
    ]);
    expect(
      demographicStepsForUser({ studentStatus: "current_student", includeWelcome: true }),
    ).toEqual(["welcome", "about_you", "campus", "personalize", "ready"]);
  });

  it("keeps faculty and students on the same four screens", () => {
    expect(demographicStepsForUser({ studentStatus: "faculty_staff" })).toEqual([
      "about_you",
      "campus",
      "personalize",
      "ready",
    ]);
    expect(demographicStepsForUser({ studentStatus: "graduate_student" })).toEqual([
      "about_you",
      "campus",
      "personalize",
      "ready",
    ]);
    expect(nextDemographicStep({ current: "about_you", studentStatus: "faculty_staff" })).toBe("campus");
    expect(nextDemographicStep({ current: "campus", studentStatus: "current_student" })).toBe("personalize");
    expect(nextDemographicStep({ current: "personalize", studentStatus: "current_student" })).toBe("ready");
    expect(nextDemographicStep({ current: "ready", studentStatus: "current_student" })).toBeNull();
  });

  it("maps legacy in-progress steps onto the four-screen flow", () => {
    expect(canonicalizeDemographicStep("graduation_year")).toBe("about_you");
    expect(canonicalizeDemographicStep("school")).toBe("campus");
    expect(canonicalizeDemographicStep("email_verification")).toBe("campus");
    expect(canonicalizeDemographicStep("interests")).toBe("personalize");
    expect(canonicalizeDemographicStep("communities")).toBe("personalize");
    expect(canonicalizeDemographicStep("success")).toBe("ready");
  });

  it("limits an email-only remainder to campus verification then the final screen", () => {
    expect(demographicStepsForUser({ emailOnly: true, studentStatus: "current_student" })).toEqual([
      "campus",
      "ready",
    ]);
    expect(nextDemographicStep({ current: "campus", emailOnly: true })).toBe("ready");
    expect(previousDemographicStep({ current: "campus", emailOnly: true })).toBeNull();
  });

  it("walks back without restarting the flow", () => {
    expect(previousDemographicStep({ current: "campus", studentStatus: "current_student" })).toBe("about_you");
    expect(previousDemographicStep({ current: "personalize", studentStatus: "faculty_staff" })).toBe("campus");
    expect(
      previousDemographicStep({
        current: "about_you",
        studentStatus: "current_student",
        includeWelcome: true,
      }),
    ).toBe("welcome");
  });

  it("reports Getting started progress as 1–4 of 4, including the final screen", () => {
    expect(
      demographicProgress({
        current: "campus",
        studentStatus: "current_student",
      }),
    ).toEqual({
      current: 2,
      total: 4,
      label: "Getting started · 2 of 4",
    });

    expect(
      demographicProgress({
        current: "personalize",
        studentStatus: "faculty_staff",
      }),
    ).toEqual({
      current: 3,
      total: 4,
      label: "Getting started · 3 of 4",
    });

    expect(
      demographicProgress({
        current: "ready",
        studentStatus: "current_student",
      }),
    ).toEqual({
      current: 4,
      total: 4,
      label: "Getting started · 4 of 4",
    });

    expect(
      demographicProgress({
        current: "campus",
        studentStatus: "current_student",
        emailOnly: true,
      }),
    ).toEqual({
      current: 2,
      total: 4,
      label: "Getting started · 2 of 4",
    });

    expect(demographicProgress({ current: "welcome", studentStatus: "current_student" })).toBeNull();
  });
});

describe("demographic onboarding resume", () => {
  it("starts an authenticated user on About You, not the public welcome screen", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
      }),
    ).toBe("about_you");
  });

  it("stays on About You until a required graduation year is answered", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null, student_status: "current_student" },
        preferences: { exists: false, interests: [] },
      }),
    ).toBe("about_you");
  });

  it("sends an unverified student with a saved year to campus before personalization", () => {
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "incoming_student",
          institution_id: "uri",
          class_year: 2028,
          campus_email_verified_at: null,
        },
        preferences: { exists: false, interests: ["athletics"] },
      }),
    ).toBe("campus");
  });

  it("resumes personalization once campus email is verified and interests are incomplete", () => {
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          class_year: 2027,
          campus_email_verified_at: "2026-08-25T00:00:00.000Z",
        },
        preferences: { exists: false, interests: ["athletics", "music", "tech"] },
        draft: {
          step: "communities",
          studentStatus: "current_student",
          interests: ["athletics", "music", "tech"],
        },
      }),
    ).toBe("personalize");
  });

  it("opens campus verification when demographics are complete and only the URI email remains", () => {
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          campus_email_verified_at: null,
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"], institutionId: "uri" },
        startAtEmailVerification: true,
      }),
    ).toBe("campus");
  });

  it("opens the final screen when an email-only remainder is already verified", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: "2026-08-25T00:00:00.000Z" },
        startAtEmailVerification: true,
      }),
    ).toBe("ready");
  });

  it("ignores a stale verification draft when earlier required fields are missing", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
        draft: { step: "email_verification" },
      }),
    ).toBe("about_you");
  });

  it("QA full replay starts at About You and follows the canonical draft step", () => {
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          campus_email_verified_at: "2026-08-01T00:00:00.000Z",
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"] },
        startAtEmailVerification: true,
        forceFullReplay: true,
      }),
    ).toBe("about_you");

    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"] },
        draft: { step: "school", studentStatus: "incoming_student" },
        forceFullReplay: true,
      }),
    ).toBe("campus");
  });

  it("honors a same-session campus draft", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { student_status: "current_student", campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
        draft: {
          step: "school",
          studentStatus: "current_student",
          graduationYear: 2029,
        },
      }),
    ).toBe("campus");
  });

  it("keeps a verified user on personalization after the interest minimum is met", () => {
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          class_year: 2028,
          campus_email_verified_at: "2026-08-25T00:00:00.000Z",
        },
        preferences: { exists: false, interests: [] },
        draft: {
          step: "interests",
          studentStatus: "current_student",
          interests: ["athletics", "music", "tech"],
        },
      }),
    ).toBe("personalize");
  });
});
