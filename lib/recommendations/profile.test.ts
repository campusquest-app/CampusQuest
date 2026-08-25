import { describe, expect, it } from "vitest";
import { inferAffinitiesFromSignals } from "@/lib/recommendations/profile";
import { publicPopularityCount, shouldExposeRecommendationDebug } from "@/lib/recommendations/debug";

describe("recommendation profile safety", () => {
  it("keeps explicit onboarding interests separate from inferred affinities", () => {
    const explicit = ["athletics", "music", "clubs"];
    const inferred = inferAffinitiesFromSignals([
      { kind: "rsvp_going", topicIds: ["art"] },
      { kind: "check_in", topicIds: ["art", "fine_arts"] },
      { kind: "org_follower", topicIds: ["fine_arts"] },
    ]);
    expect(explicit).toEqual(["athletics", "music", "clubs"]);
    expect(inferred.art).toBeGreaterThan(0);
    expect(inferred.athletics).toBeUndefined();
  });

  it("weights check-ins more strongly than interested-only RSVPs", () => {
    const inferred = inferAffinitiesFromSignals([
      { kind: "check_in", topicIds: ["art"] },
      { kind: "rsvp_interested", topicIds: ["music"] },
    ]);
    expect(inferred.art).toBeGreaterThan(inferred.music);
  });

  it("does not expose recommendation debug metadata to ordinary users", () => {
    expect(shouldExposeRecommendationDebug({ isAdmin: false, isInternalTester: false })).toBe(false);
    expect(shouldExposeRecommendationDebug({ isAdmin: false, isInternalTester: true })).toBe(true);
    expect(shouldExposeRecommendationDebug({ isAdmin: true, isInternalTester: false })).toBe(true);
  });

  it("drops tester activity from popularity", () => {
    expect(
      publicPopularityCount(
        [{ userId: "u1" }, { userId: "qa" }, { userId: "u2" }, { userId: null }],
        ["qa"],
      ),
    ).toBe(2);
  });
});
