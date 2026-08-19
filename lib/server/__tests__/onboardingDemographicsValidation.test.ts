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
});
