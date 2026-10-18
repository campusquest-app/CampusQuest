import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { emptyRecommendationProfile } from "@/lib/recommendations";
import {
  isHighlightEventEligible,
  rankHighlightEventRecommendations,
} from "@/lib/realm/highlightEventRecommendations";
import { rankMapRecommendations } from "@/lib/realm/mapRecommendations";

const NOW = new Date("2026-08-25T16:00:00.000Z");

function group(partial: Partial<GroupedMapLocation> & Pick<GroupedMapLocation, "groupKey" | "locationName">): GroupedMapLocation {
  return {
    locationKey: null,
    realmLocationId: null,
    locationAddress: null,
    x: 50,
    y: 50,
    lat: 41.4871,
    lng: -71.5305,
    attachToLandmark: false,
    qrCodes: [],
    quests: [],
    events: [],
    ...partial,
  };
}

function event(
  partial: Partial<MapEventPin> & Pick<MapEventPin, "id" | "title"> & { visibility?: string },
): MapEventPin {
  return {
    startsAt: "2026-08-26T20:00:00.000Z",
    endsAt: "2026-08-26T21:00:00.000Z",
    organizationName: null,
    eventUrl: null,
    ...partial,
  } as MapEventPin;
}

function landmark(id: string, name: string, events: MapEventPin[] = []) {
  return {
    id,
    name,
    major: true,
    lat: 41.487,
    lng: -71.53,
    mapContent: group({
      groupKey: id,
      locationName: name,
      realmLocationId: id,
      attachToLandmark: true,
      events,
    }),
  };
}

describe("Rhody Highlights event recommendations", () => {
  it("recommends events and never a campus building", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("library", "Library"),
        landmark("engineering", "Engineering Hall"),
        landmark("business", "Business Building"),
        landmark("memorial-union", "Memorial Union", [
          event({
            id: "study-skills",
            title: "Study Skills Workshop",
            category: "Academic",
            startsAt: "2026-08-26T20:00:00.000Z",
            endsAt: "2026-08-26T21:00:00.000Z",
          }),
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
    });

    expect(result.mode).toBe("personalized");
    expect(result.items.map((item) => item.title)).toEqual(["Study Skills Workshop"]);
    expect(result.items.every((item) => item.event.id)).toBe(true);
    expect(result.items.some((item) => /library|engineering hall|business building|dining/i.test(item.title))).toBe(false);
    expect(result.items[0]?.locationName).toBe("Memorial Union");
    expect(result.items[0]?.explanation).toBe("Because you're interested in Academics");
  });

  it("matches academic interests to academic events", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("library", "Library", [
          event({ id: "lecture", title: "Guest Lecture: Coastal Research", category: "Academic" }),
          event({
            id: "soccer",
            title: "Intramural Soccer",
            category: "Athletics",
            startsAt: "2026-08-25T18:00:00.000Z",
            endsAt: "2026-08-25T19:00:00.000Z",
          }),
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
    });
    expect(result.items[0]?.title).toBe("Guest Lecture: Coastal Research");
    expect(result.items[0]?.interestId).toBe("academics");
  });

  it("ranks an event matching multiple interests ahead of a single sooner match", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("quad", "The Quad", [
          event({
            id: "soon-sport",
            title: "Intramural Soccer",
            category: "Athletics",
            startsAt: "2026-08-25T18:00:00.000Z",
            endsAt: "2026-08-25T19:00:00.000Z",
          }),
          event({
            id: "both",
            title: "Study Skills and Intramural Kickoff",
            category: "Athletics",
            startsAt: "2026-08-28T20:00:00.000Z",
            endsAt: "2026-08-28T21:00:00.000Z",
          }),
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics", "athletics"] }),
      now: NOW,
    });
    expect(result.items[0]?.event.id).toBe("both");
    expect(result.items[0]?.score).toBeGreaterThan(result.items[1]?.score ?? 0);
  });

  it("does not let a building name outrank a real academic event", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("engineering", "Engineering Hall", [
          event({
            id: "pizza",
            title: "Pizza Night",
            locationText: "Engineering Hall",
            startsAt: "2026-08-25T18:00:00.000Z",
            endsAt: "2026-08-25T19:00:00.000Z",
          }),
        ]),
        landmark("quad", "The Quad", [
          event({
            id: "workshop",
            title: "Study Skills Workshop",
            startsAt: "2026-08-27T20:00:00.000Z",
            endsAt: "2026-08-27T21:00:00.000Z",
          }),
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
    });
    expect(result.items.map((item) => item.event.id)).toEqual(["workshop"]);
  });

  it("drops cancelled, ended, duplicate, and private events", () => {
    expect(
      isHighlightEventEligible(
        event({ id: "gone", title: "Ended Talk", startsAt: "2026-08-25T12:00:00.000Z", endsAt: "2026-08-25T13:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(isHighlightEventEligible(event({ id: "nope", title: "Cancelled Talk", cancelled: true }), NOW)).toBe(false);
    expect(
      isHighlightEventEligible(event({ id: "secret", title: "Private Briefing", visibility: "private" }), NOW),
    ).toBe(false);

    const duplicate = event({
      id: "copy",
      title: "Study Skills Workshop",
      externalEventId: "same-source",
    });
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("library", "Library", [
          event({ id: "ended", title: "Morning Review", startsAt: "2026-08-25T12:00:00.000Z", endsAt: "2026-08-25T13:00:00.000Z" }),
          event({ id: "cancelled", title: "Cancelled Seminar", cancelled: true }),
          event({ id: "hidden", title: "Hidden Seminar", visibility: "hidden" }),
          event({ id: "original", title: "Study Skills Workshop", externalEventId: "same-source" }),
          duplicate,
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.event.id).toBe("original");
  });

  it("prefers an event the student has not already attended", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("library", "Library", [
          event({ id: "been", title: "Study Skills Workshop", startsAt: "2026-08-25T18:00:00.000Z", endsAt: "2026-08-25T19:00:00.000Z" }),
          event({ id: "fresh", title: "Guest Lecture on Tides", startsAt: "2026-08-27T20:00:00.000Z", endsAt: "2026-08-27T21:00:00.000Z" }),
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({
        explicitInterests: ["academics"],
        attendedEventIds: ["been"],
      }),
      now: NOW,
    });
    expect(result.items[0]?.event.id).toBe("fresh");
  });

  it("does not let one organization fill the list when another interest matches", () => {
    const hiking = (id: string, title: string) =>
      event({
        id,
        title,
        organizationId: "hike-club",
        organizationName: "Hiking Club",
        category: "Outdoors",
      });
    const result = rankHighlightEventRecommendations({
      landmarks: [
        landmark("quad", "The Quad", [
          hiking("h1", "Sunrise Hike"),
          hiking("h2", "Trail Cleanup Hike"),
          hiking("h3", "Evening Hike"),
          event({ id: "show", title: "Dance Workshop", organizationId: "players", organizationName: "URI Players" }),
        ]),
      ],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["outdoors", "theater"] }),
      now: NOW,
      limit: 4,
    });
    const orgIds = result.items.map((item) => item.event.organizationId);
    expect(orgIds.filter((id) => id === "hike-club").length).toBeLessThanOrEqual(2);
    expect(result.items.some((item) => item.event.id === "show")).toBe(true);
  });

  it("updates recommendations when interests change", () => {
    const landmarks = [
      landmark("quad", "The Quad", [
        event({ id: "lecture", title: "Guest Lecture: Coastal Research" }),
        event({ id: "game", title: "Intramural Soccer", category: "Athletics" }),
      ]),
    ];
    const academic = rankHighlightEventRecommendations({
      landmarks,
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
    });
    const athletic = rankHighlightEventRecommendations({
      landmarks,
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["athletics"] }),
      now: NOW,
    });
    expect(academic.items[0]?.event.id).toBe("lecture");
    expect(athletic.items[0]?.event.id).toBe("game");
  });

  it("shows upcoming events as discovery when the student has no interests", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [landmark("library", "Library"), landmark("quad", "The Quad", [event({ id: "fair", title: "Club Fair" })])],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: [] }),
      now: NOW,
    });
    expect(result.mode).toBe("discovery");
    expect(result.items.map((item) => item.title)).toEqual(["Club Fair"]);
    expect(result.items[0]?.personalized).toBe(false);
    expect(result.items[0]?.explanation).toBe("Upcoming on campus");
    expect(result.items[0]?.interestLabel).toBeNull();
  });

  it("does not fall back to buildings when nothing matches", () => {
    const result = rankHighlightEventRecommendations({
      landmarks: [landmark("library", "Library"), landmark("dining", "Mainfare Dining Hall")],
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
    });
    expect(result.mode).toBe("empty");
    expect(result.items).toEqual([]);
  });

  it("keeps buildings available to the map For You ranker", () => {
    const landmarks = [landmark("library", "Library")];
    const ranked = rankMapRecommendations({
      landmarks,
      groups: [],
      profile: emptyRecommendationProfile({ explicitInterests: ["academics"] }),
      now: NOW,
      limit: 6,
    });
    expect(ranked.some((item) => item.kind === "place" && item.title === "Library")).toBe(true);
  });

  it("opens the event detail for a recommended event and leaves the highlights sheet mounted", () => {
    const sheet = readFileSync("components/realm/RealmHighlightsSheet.tsx", "utf8");
    const map = readFileSync("components/realm/RealmMap.tsx", "utf8");
    const cards = readFileSync("components/realm/DiscoverForYou.tsx", "utf8");
    expect(sheet).toContain("onOpenEvent(item.event)");
    expect(sheet).not.toContain("openLocation");
    expect(map).toContain("openEventDetail(event, true)");
    expect(map).toContain("rankHighlightEventRecommendations");
    expect(cards).toContain("Explore All Events");
    expect(cards).toContain("EventArtwork");
    expect(cards).not.toContain("Campus place");
  });
});
