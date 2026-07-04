import { describe, expect, it } from "vitest";
import {
  hasLegendaryQuest,
  orderQuestPathPoints,
  pickFeaturedQuest,
  resolveLandmarkMarkerVariant,
} from "@/lib/realm/realmMapMarkerUtils";

describe("realmMapMarkerUtils", () => {
  it("detects legendary quests", () => {
    expect(hasLegendaryQuest([{ id: "1", name: "A", description: "", xpReward: 10, difficulty: "easy", completionMethod: null, requiresQr: false, expiresAt: null, icon: "" }])).toBe(false);
    expect(hasLegendaryQuest([{ id: "1", name: "A", description: "", xpReward: 10, difficulty: "legendary", completionMethod: null, requiresQr: false, expiresAt: null, icon: "" }])).toBe(true);
  });

  it("resolves landmark variants by priority", () => {
    expect(
      resolveLandmarkMarkerVariant({
        activeQuests: 0,
        upcomingEvents: 0,
        activeMomentCount: 0,
        mapContent: {
          quests: [{ id: "1", name: "Legend", description: "", xpReward: 50, difficulty: "legendary", completionMethod: null, requiresQr: false, expiresAt: null, icon: "" }],
          qrCodes: [],
          events: [],
        },
      }),
    ).toBe("legendary");

    expect(
      resolveLandmarkMarkerVariant({
        activeQuests: 2,
        upcomingEvents: 1,
        activeMomentCount: 0,
        mapContent: null,
      }),
    ).toBe("quest");
  });

  it("picks legendary quest first for preview", () => {
    const featured = pickFeaturedQuest({
      quests: [
        { id: "1", name: "Daily", description: "", xpReward: 5, difficulty: "easy", completionMethod: null, requiresQr: false, expiresAt: null, icon: "" },
        { id: "2", name: "Boss", description: "", xpReward: 100, difficulty: "legendary", completionMethod: null, requiresQr: false, expiresAt: null, icon: "" },
      ],
    });
    expect(featured?.name).toBe("Boss");
  });

  it("orders quest path points by angle from center", () => {
    const ordered = orderQuestPathPoints(
      [
        { lat: 41.49, lng: -71.53 },
        { lat: 41.48, lng: -71.52 },
        { lat: 41.48, lng: -71.54 },
      ],
      { lat: 41.486, lng: -71.53 },
    );
    expect(ordered.length).toBe(3);
    expect(ordered[0].lng).toBeLessThanOrEqual(ordered[1].lng);
  });
});
