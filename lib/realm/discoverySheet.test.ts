import { describe, expect, it } from "vitest";
import {
  buildNearbyPlaceCards,
  buildNearbyPlaceCardsFromLandmarks,
  collectAthleticsHighlights,
  compactDiscoveryReason,
  cycleDiscoverySnap,
  discoverySheetSnaps,
  nearestDiscoverySnap,
  placeCardImage,
  placeCategoryLabel,
  snapFromVelocity,
  walkingMinutesFromMeters,
} from "@/lib/realm/discoverySheet";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

describe("discovery sheet snaps", () => {
  it("leaves about 42–45% of the usable map height above the default sheet", () => {
    const viewport = 844;
    const nav = 88;
    const snaps = discoverySheetSnaps(viewport, 88, nav);
    const usable = viewport - nav;
    const mapShare = usable - snaps.default;
    expect(snaps.collapsed).toBeGreaterThanOrEqual(68);
    expect(snaps.collapsed).toBeLessThanOrEqual(110);
    expect(snaps.default).toBeGreaterThan(snaps.collapsed);
    expect(snaps.expanded).toBeGreaterThan(snaps.default);
    expect(mapShare / usable).toBeGreaterThanOrEqual(0.42);
    expect(mapShare / usable).toBeLessThanOrEqual(0.48);
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

  it("uses campus photography instead of cartoon location icons", () => {
    const cards = buildNearbyPlaceCardsFromLandmarks(
      [{ id: "the-quad", name: "The Quad", category: "campus", major: true, lat: 41.4871, lng: -71.5305 }],
      { lat: 41.4862, lng: -71.5309 },
      1,
    );
    expect(cards[0]?.imageUrl).toBe("/images/places/uri/uri-quad.jpg");
    expect(cards[0]?.imageAlt).toMatch(/Quadrangle/i);
    expect(cards[0]?.imageObjectPosition).toBe("center 52%");
    expect(placeCardImage("the-quad")).not.toMatch(/\/icons\/locations\//);
    expect(placeCardImage("engineering-hall")).not.toMatch(/\/icons\/locations\//);
    expect(placeCardImage("rec-center")).not.toMatch(/\/icons\/locations\//);
  });

  it("maps supplied URI photos by stable location id", () => {
    expect(placeCardImage("the-quad")).toBe("/images/places/uri/uri-quad.jpg");
    expect(placeCardImage("library")).not.toMatch(/\/quad-feed\/|\/icons\/locations\//);
    expect(placeCardImage("engineering-hall")).not.toMatch(/\/quad-feed\/|\/icons\/locations\//);
    expect(placeCardImage("business-building")).toBe("/images/places/uri/ballentine-business.jpg");
    expect(placeCardImage("memorial-union")).toBe("/images/places/uri/memorial-union.jpg");
    expect(placeCardImage("butterfield-dining")).toBe("/images/places/uri/butterfield-dining.jpg");
    expect(placeCardImage("rec-center")).toBe("/images/places/uri/fascitelli-fitness.jpg");
    expect(placeCardImage("mainfare-dining")).toBe("/images/places/uri/hope-commons-mainfare.jpg");
    expect(placeCardImage("library")).toBe("/maps/uri-campus-map.png");
    expect(placeCardImage("engineering-hall")).toBe("/images/places/uri/fascitelli-engineering.jpg");
    expect(placeCardImage("engineering-hall")).not.toMatch(/fascitelli-fitness/);
    expect(placeCardImage("the-quad", "/icons/locations/the-quad.png")).toBe("/images/places/uri/uri-quad.jpg");
  });
});

describe("athletics highlights", () => {
  it("uses real opponent titles and prefers upcoming games over recent results", () => {
    const rows = collectAthleticsHighlights(
      [
        {
          events: [
            {
              id: "game-1",
              title: "Rhode Island vs Dayton",
              startsAt: "2026-09-01T19:00:00.000Z",
              endsAt: null,
              organizationName: "Athletics",
              eventUrl: null,
              source: "athletics",
              sport: "Women's Soccer",
              opponent: "Dayton",
              imageUrl: null,
            },
            {
              id: "game-recent",
              title: "Rhode Island vs Holy Cross",
              startsAt: "2026-08-26T18:00:00.000Z",
              endsAt: null,
              organizationName: "Athletics",
              eventUrl: null,
              source: "athletics",
              sport: "Men's Soccer",
              opponent: "Holy Cross",
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
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("URI vs. Dayton");
    expect(rows[0]?.sport).toBe("Women's Soccer");
    expect(rows[1]?.title).toBe("URI vs. Holy Cross");
  });
});

describe("compactDiscoveryReason", () => {
  it("keeps interest reasons and maps generic labels to compact copy", () => {
    expect(compactDiscoveryReason("Because you're interested in Music")).toBe("Because you're interested in Music");
    expect(compactDiscoveryReason("Popular on campus")).toBe("Try something new");
    expect(compactDiscoveryReason("A campus connection", true)).toBe("Meet people with similar interests");
    expect(compactDiscoveryReason(null, true)).toBe("Looking for something fun tonight?");
    expect(compactDiscoveryReason(null)).toBe("Recommended for you");
  });
});
