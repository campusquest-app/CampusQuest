import { describe, expect, it } from "vitest";
import {
  buildStudentDiscoveryProfile,
  recommendationProfileFromDiscovery,
} from "@/lib/recommendations/discoveryProfile";

describe("student discovery profile", () => {
  it("exposes onboarding signals without duplicating stored communities", () => {
    const input = {
      institutionId: "uri",
      studentStatus: "incoming_student",
      classYear: 2030,
      major: "Computer Science",
      academicArea: "computer_science",
      interests: ["academics", "tech", "clubs"],
      communities: ["student_organizations"],
      campusEmailVerifiedAt: "2026-08-28T12:00:00.000Z",
      onboardingCompleted: true,
    };
    const discovery = buildStudentDiscoveryProfile(input);
    expect(discovery.campusId).toBe("uri");
    expect(discovery.verifiedSchoolEmail).toBe(true);
    expect(discovery.interests).toContain("tech");
    expect(discovery.campusConnections).toEqual(["student_organizations"]);

    const rec = recommendationProfileFromDiscovery(input);
    expect(rec.explicitCommunities).toContain("student_organizations");
    expect(rec.explicitCommunities).toContain("computer_science");
    expect(rec.academicArea).toBe("computer_science");
    expect(rec.major).toBe("Computer Science");
  });

  it("leaves legacy users without a major unforced", () => {
    const discovery = buildStudentDiscoveryProfile({
      institutionId: "uri",
      studentStatus: "current_student",
      interests: ["athletics", "music", "tech"],
      communities: [],
      onboardingCharacterCompleted: true,
    });
    expect(discovery.academicArea).toBeNull();
    expect(discovery.major).toBeNull();
    expect(discovery.onboardingComplete).toBe(true);
  });
});
