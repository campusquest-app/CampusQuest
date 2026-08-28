import { describe, expect, it } from "vitest";
import {
  buildNearbyPlaceCards,
  buildNearbyPlaceCardsFromLandmarks,
  collectAthleticsHighlights,
  cycleDiscoverySnap,
  discoverySheetSnaps,
  nearestDiscoverySnap,
  placeCategoryLabel,
  snapFromVelocity,
  walkingMinutesFromMeters,
} from "@/lib/realm/discoverySheet";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

describe("discovery sheet snaps", () => {
  it("keeps collapsed small, default near half-screen, expanded near full", () => {
    const snaps = discoverySheetSnaps(844);
    expect(snaps.collapsed).toBeGreaterThanOrEqual(72);
    expect(snaps.collapsed).toBeLessThanOrEqual(110);
    expect(snaps.default).toBeGreaterThan(snaps.collapsed);
    expect(snaps.expanded).toBeGreaterThan(snaps.default);
    expect(snaps.default / 844).toBeGreaterThan(0.45);
    expect(snaps.default / 844).toBeLessThan(0.58);
  });

  it("picks the nearest snap and honors flick velocity", () => {
    const snaps = discoverySheetSnaps(844);
    expect(nearestDiscoverySnap(snaps.default + 8, snaps)).toBe("default");
    expect(snapFromVelocity(snaps.default, 0.9, snaps)).toBe("expanded");
    expect(snapFromVelocity(snaps.default, -0.9, snaps)).toBe("collapsed");
    expect(cycleDiscoverySnap("collapsed")).toBe("default");
    expect(cycleDiscoverySnap("expanded")).toBe("default");
  });
});

describe("walking estimates", () => {
  it("rounds campus walking time at 80m per minute", () => {
    expect(walkingMinutesFromMeters(0)).toBe(1);
    expect(walkingMinutesFromMeters(160)).toBe(2);
    expect(walkingMinutesFromMeters(400)).toBe(5);
  });
});

describe("nearby place cards", () => {
  it("keeps place cards free of interest-reason copy", () => {
    const items: MapRecommendationItem[] = [
      {
        id: "place:library",
        kind: "place",
        title: "Library",
        locationName: "Library",
        timeLabel: null,
        reasonLabel: "Because you're interested in Academics",
        score: 1,
        markerId: "library",
        lat: 41.4865,
        lng: -71.5301,
        eventId: null,
        questId: null,
        relatedQuestName: null,
        happeningToday: false,
        live: false,
        campusRsvp: false,
      },
    ];
    const cards = buildNearbyPlaceCards(items, { lat: 41.4862, lng: -71.5309 }, 4);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.categoryLabel).toBe("Study • Resources");
    expect(cards[0]?.walkMinutes).toBeGreaterThan(0);
    expect(placeCategoryLabel("library")).not.toMatch(/interested/i);
  });

  it("builds nearby cards from real landmarks without interest-reason copy", () => {
    const cards = buildNearbyPlaceCardsFromLandmarks(
      [
        { id: "library", name: "Library", category: "study", major: true, lat: 41.4865, lng: -71.5301 },
        { id: "engineering-hall", name: "Engineering Hall", category: "academics", major: true, lat: 41.4869, lng: -71.5294 },
      ],
      { lat: 41.4862, lng: -71.5309 },
      4,
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]?.categoryLabel).not.toMatch(/interested/i);
    expect(cards[0]?.walkMinutes).toBeGreaterThan(0);
    expect(cards[0]?.imageUrl.length).toBeGreaterThan(0);
  });
});

describe("athletics highlights", () => {
  it("keeps upcoming athletics rows and skips non-athletics", () => {
    const rows = collectAthleticsHighlights(
      [
        {
          events: [
            {
              id: "game-1",
              title: "URI vs Dayton",
              startsAt: "2026-09-01T19:00:00.000Z",
              endsAt: null,
              organizationName: "Athletics",
              eventUrl: null,
              source: "athletics",
              sport: "Women's Soccer",
              imageUrl: null,
            },
            {
              id: "club-1",
              title: "Club Fair",
              startsAt: "2026-09-01T18:00:00.000Z",
              endsAt: null,
              organizationName: "Student Senate",
              eventUrl: null,
              source: "urinvolved",
            },
          ],
        },
      ],
      new Date("2026-08-28T16:00:00.000Z"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sport).toBe("Women's Soccer");
    expect(rows[0]?.title).toBe("URI vs Dayton");
  });
});
