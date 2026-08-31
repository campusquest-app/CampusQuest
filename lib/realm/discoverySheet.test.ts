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
  walkingMinutesBetween,
  isCampusWalkOrigin,
  athleticsHighlightSlots,
  buildRhodyHighlights,
  campusWalkTimeStatus,
  walkTimeLabel,
} from "@/lib/realm/discoverySheet";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

describe("discovery sheet snaps", () => {
  it("keeps the default overlay under half the usable height so the map stays dominant", () => {
    const viewport = 844;
    const nav = 88;
    const snaps = discoverySheetSnaps(viewport, 120, nav);
    const usable = viewport - nav;
    const mapShare = usable - snaps.default;
    expect(snaps.collapsed).toBeGreaterThanOrEqual(64);
    expect(snaps.collapsed).toBeLessThanOrEqual(96);
    expect(snaps.default).toBeGreaterThan(snaps.collapsed);
    expect(snaps.expanded).toBeGreaterThan(snaps.default);
    expect(mapShare / usable).toBeGreaterThanOrEqual(0.64);
    expect(snaps.default / usable).toBeLessThanOrEqual(0.36);
    expect(snaps.defaultMax / usable).toBeLessThanOrEqual(0.36);
  });

  it("hugs measured content instead of stretching a tall empty panel", () => {
    const snaps = discoverySheetSnaps(844, 120, 88, 230);
    expect(snaps.default).toBe(230);
    expect(snaps.default).toBeLessThan(discoverySheetSnaps(844, 120, 88).defaultMax);
  });

  it("lets compact measured content exceed the empty 34% cap without becoming a half-screen slab", () => {
    const viewport = 844;
    const nav = 88;
    const usable = viewport - nav;
    const snaps = discoverySheetSnaps(viewport, 120, nav, 290);
    expect(snaps.default).toBe(290);
    expect(snaps.default / usable).toBeLessThanOrEqual(0.4);
    expect(discoverySheetSnaps(viewport, 120, nav, 520).default / usable).toBeLessThanOrEqual(0.4);
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

  it("only reports walk time from a precise on-campus GPS fix", () => {
    const library = { lat: 41.4865, lng: -71.5301 };
    expect(isCampusWalkOrigin({ lat: 41.4862, lng: -71.5309 })).toBe(true);
    expect(walkingMinutesBetween({ lat: 41.4862, lng: -71.5309 }, library)).toBeGreaterThan(0);
    expect(walkingMinutesBetween(null, library)).toBeNull();
    expect(walkingMinutesBetween({ lat: 41.7, lng: -71.4 }, library)).toBeNull();
    expect(walkingMinutesBetween({ lat: -71.5309, lng: 41.4862 }, library)).toBeNull();
    expect(walkingMinutesBetween({ lat: 41.4862, lng: -71.5309, accuracy: 5000 }, library)).toBeNull();
  });

  it("rejects a ~5km GPS fix that used to sit inside the wide Kingston bbox", () => {
    const library = { lat: 41.4865, lng: -71.5301 };
    const fiveKmNorth = { lat: 41.5312, lng: -71.5309 };
    const oldWideBboxEdge = { lat: 41.465, lng: -71.555 };
    expect(isCampusWalkOrigin(fiveKmNorth)).toBe(false);
    expect(isCampusWalkOrigin(oldWideBboxEdge)).toBe(false);
    expect(walkingMinutesBetween(fiveKmNorth, library)).toBeNull();
    expect(walkingMinutesBetween(oldWideBboxEdge, library)).toBeNull();
  });

  it("rejects campus-scale walks that are still longer than a short campus hop", () => {
    const library = { lat: 41.4865, lng: -71.5301 };
    const farOnCampusEdge = { lat: 41.4821, lng: -71.5358 };
    const minutes = walkingMinutesBetween(farOnCampusEdge, library);
    expect(minutes == null || minutes <= 18).toBe(true);
    expect(
      walkingMinutesBetween({ lat: 41.4862, lng: -71.5309 }, { lat: 41.5005, lng: -71.5309 }),
    ).toBeNull();
  });

  it("labels missing GPS as locating or unavailable, never fake minutes", () => {
    expect(campusWalkTimeStatus(null, true)).toBe("locating");
    expect(campusWalkTimeStatus(null, false)).toBe("unavailable");
    expect(campusWalkTimeStatus({ lat: 41.5312, lng: -71.5309 }, false)).toBe("unavailable");
    expect(campusWalkTimeStatus({ lat: 41.4862, lng: -71.5309 }, false)).toBe("ready");
    expect(walkTimeLabel(null, "locating")).toBe("Locating…");
    expect(walkTimeLabel(null, "unavailable")).toBe("Walk time unavailable");
    expect(walkTimeLabel(3, "unavailable")).toBe("3 min walk");
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
    expect(buildNearbyPlaceCards(items, null, 4)[0]?.walkMinutes).toBeNull();
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
    expect(placeCardImage("library")).toBe("/images/places/uri/carothers-library.jpg");
    expect(placeCardImage("library")).not.toMatch(/\/quad-feed\/|\/icons\/locations\//);
    expect(placeCardImage("engineering-hall")).not.toMatch(/\/quad-feed\/|\/icons\/locations\//);
    expect(placeCardImage("business-building")).toBe("/images/places/uri/ballentine-business.jpg");
    expect(placeCardImage("memorial-union")).toBe("/images/places/uri/memorial-union.jpg");
    expect(placeCardImage("butterfield-dining")).toBe("/images/places/uri/butterfield-dining.jpg");
    expect(placeCardImage("rec-center")).toBe("/images/places/uri/fascitelli-fitness.jpg");
    expect(placeCardImage("mainfare-dining")).toBe("/images/places/uri/hope-commons-mainfare.jpg");
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

  it("keeps three athletics rows when no games have loaded", () => {
    const slots = athleticsHighlightSlots([]);
    expect(slots).toHaveLength(3);
    expect(slots[0]?.title).not.toMatch(/Villanova|UMass|Dayton/i);
    expect(slots.every((row) => row.type === "placeholder")).toBe(true);
  });

  it("pads a single loaded game out to three highlight rows", () => {
    const slots = athleticsHighlightSlots([
      {
        id: "game-1",
        type: "athletics",
        title: "URI vs. Dayton",
        sport: "Women's Soccer",
        opponent: "Dayton",
        timeLabel: "Tue • 7:00 PM",
        durationLabel: null,
        imageUrl: "/quad-feed/running.jpg",
        imageFallbackUrl: null,
        broadcastUrl: null,
        youtubeVideoId: null,
        url: null,
        playable: false,
      },
    ]);
    expect(slots).toHaveLength(3);
    expect(slots[0]?.title).toBe("URI vs. Dayton");
    expect(slots[1]?.id).toMatch(/athletics-slot/);
  });

  it("surfaces only the curated Rams YouTube short in the Rhody Highlights preview", () => {
    const rows = buildRhodyHighlights([], new Date("2026-08-28T16:00:00.000Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("youtube");
    expect(rows[0]?.youtubeVideoId).toBe("WeztHt4UU_U");
    expect(rows[0]?.url).toBe("https://www.youtube.com/watch?v=WeztHt4UU_U");
    expect(rows[0]?.imageUrl).toBe("https://img.youtube.com/vi/WeztHt4UU_U/maxresdefault.jpg");
    expect(rows[0]?.imageFallbackUrl).toBe("https://img.youtube.com/vi/WeztHt4UU_U/hqdefault.jpg");
    expect(rows[0]?.title).toMatch(/Rams are Coming/i);
    expect(rows[0]?.playable).toBe(true);
    expect(rows.every((row) => row.type !== "placeholder")).toBe(true);
  });

  it("can restore a padded three-row Rhody Highlights card when asked", () => {
    const rows = buildRhodyHighlights([], new Date("2026-08-28T16:00:00.000Z"), 3, undefined, {
      padPlaceholders: true,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]?.youtubeVideoId).toBe("WeztHt4UU_U");
    expect(rows[1]?.sport).toBe("Upcoming");
    expect(rows[2]?.sport).toBe("Results");
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
