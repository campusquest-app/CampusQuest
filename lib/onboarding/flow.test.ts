import { describe, expect, it } from "vitest";
import {
  DEMOGRAPHIC_ONBOARDING_STEPS,
  demographicProgress,
  demographicStepsForUser,
  nextDemographicStep,
  previousDemographicStep,
} from "@/lib/onboarding/flow";

describe("demographic onboarding order", () => {
  it("uses the shared first-time order: type → campus → email → graduation → interests → communities", () => {
    expect(DEMOGRAPHIC_ONBOARDING_STEPS).toEqual([
      "welcome",
      "student_status",
      "school",
      "email_verification",
      "graduation_year",
      "interests",
      "communities",
    ]);
    expect(
      demographicStepsForUser({ studentStatus: "current_student", includeWelcome: true }),
    ).toEqual([
      "welcome",
      "student_status",
      "school",
      "email_verification",
      "graduation_year",
      "interests",
      "communities",
    ]);
  });

  it("skips graduation year for faculty/staff", () => {
    expect(demographicStepsForUser({ studentStatus: "faculty_staff" })).toEqual([
      "student_status",
      "school",
      "email_verification",
      "interests",
      "communities",
    ]);
    expect(
      nextDemographicStep({ current: "email_verification", studentStatus: "faculty_staff" }),
    ).toBe("interests");
    expect(demographicStepsForUser({ studentStatus: "faculty_staff" })).not.toContain("graduation_year");
  });

  it("skips graduation year for the legacy not_student answer", () => {
    expect(demographicStepsForUser({ studentStatus: "not_student" })).not.toContain("graduation_year");
  });

  it("keeps graduation year for current, incoming, and graduate students", () => {
    for (const status of ["current_student", "incoming_student", "graduate_student", "current_or_incoming"] as const) {
      expect(demographicStepsForUser({ studentStatus: status })).toContain("graduation_year");
      expect(nextDemographicStep({ current: "email_verification", studentStatus: status })).toBe(
        "graduation_year",
      );
    }
  });

  it("does not treat graduate students as a faculty skip", () => {
    expect(nextDemographicStep({ current: "graduation_year", studentStatus: "graduate_student" })).toBe(
      "interests",
    );
  });

  it("limits the email-only gate to verification", () => {
    expect(demographicStepsForUser({ emailOnly: true, studentStatus: "current_student" })).toEqual([
      "email_verification",
    ]);
    expect(nextDemographicStep({ current: "email_verification", emailOnly: true })).toBeNull();
    expect(previousDemographicStep({ current: "email_verification", emailOnly: true })).toBeNull();
  });

  it("walks back without restarting the flow", () => {
    expect(previousDemographicStep({ current: "school", studentStatus: "current_student" })).toBe(
      "student_status",
    );
    expect(
      previousDemographicStep({ current: "interests", studentStatus: "faculty_staff" }),
    ).toBe("email_verification");
  });

  it("reports Getting started progress that matches remaining demographic stages", () => {
    const student = demographicProgress({
      current: "school",
      studentStatus: "current_student",
      includeWelcome: true,
    });
    expect(student).toEqual({
      current: 2,
      total: 6,
      label: "Getting started · 2 of 6",
    });

    const faculty = demographicProgress({
      current: "interests",
      studentStatus: "faculty_staff",
    });
    expect(faculty).toEqual({
      current: 4,
      total: 5,
      label: "Getting started · 4 of 5",
    });

    expect(demographicProgress({ current: "welcome", studentStatus: "current_student" })).toBeNull();
  });

  it("does not expose a Preferences saved step", () => {
    expect(DEMOGRAPHIC_ONBOARDING_STEPS as readonly string[]).not.toContain("success");
    expect(nextDemographicStep({ current: "communities", studentStatus: "current_student" })).toBeNull();
  });
});
