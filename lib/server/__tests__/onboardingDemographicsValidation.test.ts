import { describe, expect, it } from "vitest";
import { onboardingPreferencesSchema, patchMeProfileSchema } from "@/lib/server/validation";

describe("onboarding preferences validation", () => {
  it("accepts v2 payload with communities and institution", () => {
    const parsed = onboardingPreferencesSchema.parse({
      schoolName: "University of Rhode Island",
      interests: ["athletics", "music", "tech"],
      communities: ["engineering", "athletics"],
      institutionId: "uri",
      studentStatus: "current_or_incoming",
      classYear: 2028,
      onboardingVersion: 2,
      markOnboardingComplete: false,
      discoveryFocus: ["events", "organizations", "meet_students"],
      major: "",
    });
    expect(parsed.interests).toHaveLength(3);
    expect(parsed.communities).toContain("engineering");
    expect(parsed.institutionId).toBe("uri");
  });

  it("rejects fewer than 3 interests", () => {
    expect(() =>
      onboardingPreferencesSchema.parse({
        schoolName: "University of Rhode Island",
        interests: [],
        discoveryFocus: ["events"],
      }),
    ).toThrow();
    expect(() =>
      onboardingPreferencesSchema.parse({
        schoolName: "University of Rhode Island",
        interests: ["athletics", "music"],
        discoveryFocus: ["events"],
      }),
    ).toThrow();
  });

  it("accepts demographic fields on profile patch", () => {
    const parsed = patchMeProfileSchema.parse({
      studentStatus: "current_or_incoming",
      institutionId: "uri",
      classYear: 2027,
      onboardingVersion: 2,
    });
    expect(parsed.studentStatus).toBe("current_or_incoming");
    expect(parsed.institutionId).toBe("uri");
  });

  it("accepts the expanded user-type values without dropping legacy ones", () => {
    expect(patchMeProfileSchema.parse({ studentStatus: "current_student" }).studentStatus).toBe(
      "current_student",
    );
    expect(patchMeProfileSchema.parse({ studentStatus: "incoming_student" }).studentStatus).toBe(
      "incoming_student",
    );
    expect(patchMeProfileSchema.parse({ studentStatus: "graduate_student" }).studentStatus).toBe(
      "graduate_student",
    );
    expect(patchMeProfileSchema.parse({ studentStatus: "faculty_staff" }).studentStatus).toBe(
      "faculty_staff",
    );
    expect(onboardingPreferencesSchema.parse({
      schoolName: "University of Rhode Island",
      interests: ["athletics", "music", "tech"],
      studentStatus: "faculty_staff",
      classYear: null,
      communities: [],
    }).studentStatus).toBe("faculty_staff");
  });

  it("allows empty communities on save", () => {
    const parsed = onboardingPreferencesSchema.parse({
      schoolName: "University of Rhode Island",
      interests: ["athletics", "music", "tech"],
      communities: [],
    });
    expect(parsed.communities).toEqual([]);
  });

  it("accepts optional academic area on preferences and profile patch", () => {
    const prefs = onboardingPreferencesSchema.parse({
      schoolName: "University of Rhode Island",
      interests: ["athletics", "music", "tech"],
      academicArea: "engineering",
      major: "Mechanical Engineering",
    });
    expect(prefs.academicArea).toBe("engineering");
    expect(
      patchMeProfileSchema.parse({ academicArea: "undecided", requestedSchoolName: "Brown University" }),
    ).toEqual(
      expect.objectContaining({
        academicArea: "undecided",
        requestedSchoolName: "Brown University",
      }),
    );
  });
});
