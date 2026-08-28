import { describe, expect, it } from "vitest";
import { matchRecommendationTopics } from "@/lib/recommendations/match";
import { isCampusWideImportant } from "@/lib/recommendations/campusImportance";
import { campusEventToRecommendationEntity, externalEventToRecommendationEntity } from "@/lib/recommendations/adapters";

describe("recommendation topic matching", () => {
  it("maps an imported Athletics event from sport and title", () => {
    const match = matchRecommendationTopics(
      externalEventToRecommendationEntity({
        id: "ath-1",
        title: "University of Rhode Island Men's Basketball vs Holy Cross",
        description: "Home game at the Ryan Center",
        category: "Athletics",
        sport: "Men's Basketball",
        opponent: "Holy Cross",
        venueName: "Kingston, RI, Thomas M. Ryan Center",
      }),
    );
    expect(match.interestIds).toContain("athletics");
    expect(match.communityIds).toContain("athletics");
  });

  it("maps a basketball game to athletics from keywords", () => {
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: "1",
        title: "URI Men's Basketball vs Fordham",
        description: "Game day at the Ryan Center",
        category: "Athletics",
      }),
    );
    expect(match.interestIds).toContain("athletics");
    expect(match.communityIds).toContain("athletics");
  });

  it("maps a concert to music and fine arts", () => {
    const match = matchRecommendationTopics(
      externalEventToRecommendationEntity({
        id: "2",
        title: "Spring Concert",
        description: "Live music at the Memorial Union",
        category: "Music",
        tags: ["concert"],
      }),
    );
    expect(match.interestIds).toContain("music");
    expect(match.communityIds).toContain("fine_arts");
  });

  it("maps a career fair to career / business", () => {
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: "3",
        title: "Spring Career Fair",
        description: "Meet employers and bring your resume",
        category: "Career",
      }),
    );
    expect(match.interestIds).toContain("career");
  });

  it("maps a hackathon to tech, competitions, and computer science", () => {
    const match = matchRecommendationTopics(
      externalEventToRecommendationEntity({
        id: "4",
        title: "URI Hackathon",
        description: "Build software overnight",
        category: "Technology",
        tags: ["hackathon"],
      }),
    );
    expect(match.interestIds).toContain("tech");
    expect(match.interestIds).toContain("competitions");
    expect(match.communityIds).toContain("computer_science");
  });

  it("maps Talent Development from structured organization text", () => {
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: "5",
        title: "Talent Development workshop",
        description: "TDI community meetup",
        hostOrganization: { id: "org-1", name: "Talent Development" },
      }),
    );
    expect(match.communityIds).toContain("talent_development");
  });

  it("maps a student organization fair to clubs", () => {
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: "6",
        title: "Student Organization Fair",
        description: "Meet clubs on the quad",
      }),
    );
    expect(match.interestIds).toContain("clubs");
    expect(match.communityIds).toContain("student_organizations");
  });

  it("prefers structured category over guessing", () => {
    const match = matchRecommendationTopics(
      campusEventToRecommendationEntity({
        id: "7",
        title: "Weekly meetup",
        category: "engineering",
      }),
    );
    expect(match.communityIds).toContain("engineering");
  });

  it("maps a wellness session and an entrepreneurship mixer to the new interest ids", () => {
    expect(
      matchRecommendationTopics(
        campusEventToRecommendationEntity({
          id: "w1",
          title: "Mindfulness and wellness workshop",
          category: "Wellness",
        }),
      ).interestIds,
    ).toContain("wellness");
    expect(
      matchRecommendationTopics(
        campusEventToRecommendationEntity({
          id: "e1",
          title: "Student entrepreneur mixer",
          description: "Meet founders from the business school",
        }),
      ).interestIds,
    ).toContain("entrepreneurship");
  });
});

describe("campus-wide importance", () => {
  it("flags Rhody Fest without requiring an interest match", () => {
    expect(
      isCampusWideImportant(
        campusEventToRecommendationEntity({
          id: "rf",
          title: "Rhody Fest",
          description: "Campus-wide celebration",
        }),
      ),
    ).toBe(true);
  });
});
