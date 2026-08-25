import { describe, expect, it } from "vitest";
import {
  DEMOGRAPHIC_ONBOARDING_STEPS,
  demographicProgress,
  demographicStepsForUser,
  nextDemographicStep,
  previousDemographicStep,
  resolveDemographicResumeStep,
} from "@/lib/onboarding/flow";

describe("demographic onboarding order", () => {
  it("uses Welcome → status → graduation → school → interests → communities → email → success", () => {
    expect(DEMOGRAPHIC_ONBOARDING_STEPS).toEqual([
      "welcome",
      "student_status",
      "graduation_year",
      "school",
      "interests",
      "communities",
      "email_verification",
      "success",
    ]);
    expect(
      demographicStepsForUser({ studentStatus: "current_student", includeWelcome: true }),
    ).toEqual([
      "welcome",
      "student_status",
      "graduation_year",
      "school",
      "interests",
      "communities",
      "email_verification",
      "success",
    ]);
  });

  it("skips graduation year for faculty/staff", () => {
    expect(demographicStepsForUser({ studentStatus: "faculty_staff" })).toEqual([
      "student_status",
      "school",
      "interests",
      "communities",
      "email_verification",
      "success",
    ]);
    expect(nextDemographicStep({ current: "student_status", studentStatus: "faculty_staff" })).toBe("school");
    expect(demographicStepsForUser({ studentStatus: "faculty_staff" })).not.toContain("graduation_year");
  });

  it("skips graduation year for the legacy not_student answer", () => {
    expect(demographicStepsForUser({ studentStatus: "not_student" })).not.toContain("graduation_year");
  });

  it("keeps graduation year for current, incoming, and graduate students", () => {
    for (const status of ["current_student", "incoming_student", "graduate_student", "current_or_incoming"] as const) {
      expect(demographicStepsForUser({ studentStatus: status })).toContain("graduation_year");
      expect(nextDemographicStep({ current: "student_status", studentStatus: status })).toBe("graduation_year");
      expect(nextDemographicStep({ current: "graduation_year", studentStatus: status })).toBe("school");
    }
  });

  it("does not treat graduate students as a faculty skip", () => {
    expect(nextDemographicStep({ current: "graduation_year", studentStatus: "graduate_student" })).toBe("school");
  });

  it("places URI email after communities and success after verification", () => {
    expect(nextDemographicStep({ current: "communities", studentStatus: "current_student" })).toBe(
      "email_verification",
    );
    expect(nextDemographicStep({ current: "email_verification", studentStatus: "current_student" })).toBe("success");
    expect(nextDemographicStep({ current: "success", studentStatus: "current_student" })).toBeNull();
  });

  it("limits the email-only remainder to verification then success", () => {
    expect(demographicStepsForUser({ emailOnly: true, studentStatus: "current_student" })).toEqual([
      "email_verification",
      "success",
    ]);
    expect(nextDemographicStep({ current: "email_verification", emailOnly: true })).toBe("success");
    expect(previousDemographicStep({ current: "email_verification", emailOnly: true })).toBeNull();
    expect(nextDemographicStep({ current: "success", emailOnly: true })).toBeNull();
  });

  it("walks back without restarting the flow", () => {
    expect(previousDemographicStep({ current: "school", studentStatus: "current_student" })).toBe(
      "graduation_year",
    );
    expect(previousDemographicStep({ current: "interests", studentStatus: "faculty_staff" })).toBe("school");
    expect(
      previousDemographicStep({
        current: "student_status",
        studentStatus: "current_student",
        includeWelcome: true,
      }),
    ).toBe("welcome");
  });

  it("reports Getting started progress against the full sequence, never 1 of 1 for email", () => {
    const student = demographicProgress({
      current: "school",
      studentStatus: "current_student",
      includeWelcome: true,
    });
    expect(student).toEqual({
      current: 3,
      total: 6,
      label: "Getting started · 3 of 6",
    });

    const faculty = demographicProgress({
      current: "interests",
      studentStatus: "faculty_staff",
    });
    expect(faculty).toEqual({
      current: 3,
      total: 5,
      label: "Getting started · 3 of 5",
    });

    expect(
      demographicProgress({
        current: "email_verification",
        studentStatus: "current_student",
        emailOnly: true,
      }),
    ).toEqual({
      current: 6,
      total: 6,
      label: "Getting started · 6 of 6",
    });

    expect(demographicProgress({ current: "welcome", studentStatus: "current_student" })).toBeNull();
    expect(demographicProgress({ current: "success", studentStatus: "current_student" })).toBeNull();
  });
});

describe("demographic onboarding resume", () => {
  it("starts new users on Welcome even when they already have an auth session", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
      }),
    ).toBe("welcome");
  });

  it("does not treat unverified email as the current step when demographics are incomplete", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null, student_status: "current_student" },
        preferences: { exists: false, interests: [] },
        startAtEmailVerification: false,
      }),
    ).toBe("graduation_year");
  });

  it("resumes the first incomplete demographic step", () => {
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
    ).toBe("interests");

    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          class_year: 2027,
          campus_email_verified_at: null,
        },
        preferences: { exists: false, interests: ["athletics", "music", "tech"] },
        draft: { step: "communities", studentStatus: "current_student", interests: ["athletics", "music", "tech"] },
      }),
    ).toBe("communities");
  });

  it("goes directly to OTP when demographics are complete and only verification remains", () => {
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
    ).toBe("email_verification");
  });

  it("shows success when email is already verified in an email-only remainder", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: "2026-08-25T00:00:00.000Z" },
        startAtEmailVerification: true,
      }),
    ).toBe("success");
  });

  it("ignores a stale email_verification draft when earlier required fields are missing", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
        draft: { step: "email_verification" },
      }),
    ).toBe("welcome");
  });

  it("QA full replay starts at Welcome and follows the in-session draft, ignoring completed server rows", () => {
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
    ).toBe("welcome");

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
    ).toBe("school");
  });

  it("honors a same-session draft so refresh returns to the current step", () => {
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
    ).toBe("school");
  });

  it("keeps a user on interests after refresh once the minimum selection is met", () => {
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          class_year: 2028,
          campus_email_verified_at: null,
        },
        preferences: { exists: false, interests: [] },
        draft: {
          step: "interests",
          studentStatus: "current_student",
          interests: ["athletics", "music", "tech"],
        },
      }),
    ).toBe("interests");
  });
});
