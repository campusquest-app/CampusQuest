import { describe, expect, it } from "vitest";
import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount } from "@/lib/mapLocationGroups";
import { mapEventPinToFeedEvent, singleLiveEventForMarkerTap } from "@/lib/realm/mapEventPinToFeedEvent";

const NOW = new Date("2026-07-09T22:00:00.000Z");

function pin(overrides: Partial<MapEventPin>): MapEventPin {
  return {
    id: "e1",
    title: "Open Mic",
    startsAt: "2026-07-09T22:30:00.000Z",
    endsAt: "2026-07-09T23:30:00.000Z",
    organizationName: "Union Board",
    eventUrl: null,
    locationText: "Memorial Union",
    ...overrides,
  };
}

function group(overrides: Partial<GroupedMapLocation> = {}): GroupedMapLocation {
  return {
    groupKey: "weldin",
    locationKey: null,
    realmLocationId: null,
    locationName: "Weldin Hall",
    locationAddress: null,
    x: 50,
    y: 50,
    lat: 41.487,
    lng: -71.53,
    attachToLandmark: false,
    qrCodes: [],
    quests: [],
    events: [],
    ...overrides,
  };
}

describe("mapEventPinToFeedEvent", () => {
  it("keeps campus identity, time, location, and cancelled status", () => {
    const item = mapEventPinToFeedEvent(
      pin({
        id: "karaoke",
        title: "Karaoke Night",
        cancelled: true,
      }),
    );
    expect(item.kind).toBe("campus");
    if (item.kind !== "campus") return;
    expect(item.event.id).toBe("karaoke");
    expect(item.event.title).toBe("Karaoke Night");
    expect(item.event.location).toBe("Memorial Union");
    expect(item.event.startsAt).toBe("2026-07-09T22:30:00.000Z");
    expect(item.event.isCancelled).toBe(true);
  });

  it("maps imported events with cancelled status", () => {
    const item = mapEventPinToFeedEvent(
      pin({
        id: "ext",
        source: "urinvolved",
        externalEventId: "ext-1",
        title: "Club Fair",
        cancelled: true,
      }),
    );
    expect(item.kind).toBe("external");
    if (item.kind !== "external") return;
    expect(item.event.id).toBe("ext-1");
    expect(item.event.title).toBe("Club Fair");
    expect(item.event.isCancelled).toBe(true);
  });
});

describe("singleLiveEventForMarkerTap", () => {
  it("opens the event when a supplementary pin has exactly one live event", () => {
    const live = pin({ id: "live" });
    expect(singleLiveEventForMarkerTap(group({ events: [live] }), NOW)?.id).toBe("live");
  });

  it("returns null when multiple live events share the pin", () => {
    expect(
      singleLiveEventForMarkerTap(
        group({
          events: [pin({ id: "a" }), pin({ id: "b", startsAt: "2026-07-09T23:00:00.000Z" })],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("ignores cancelled-only pins and stacked quest pins", () => {
    expect(
      singleLiveEventForMarkerTap(
        group({ events: [pin({ id: "c", title: "Karaoke Night", cancelled: true })] }),
        NOW,
      ),
    ).toBeNull();
    expect(
      singleLiveEventForMarkerTap(
        group({
          events: [pin({ id: "live" })],
          quests: [
            {
              id: "q1",
              name: "Quest",
              description: "",
              xpReward: 10,
              difficulty: null,
              completionMethod: null,
              requiresQr: false,
              expiresAt: null,
              icon: "",
            },
          ],
        }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("mapLocationActivityCount", () => {
  it("does not count cancelled events as live map activity", () => {
    expect(
      mapLocationActivityCount(
        group({ events: [pin({ id: "c", title: "Karaoke Night", cancelled: true })] }),
        null,
        NOW,
      ),
    ).toBe(0);
    expect(mapLocationActivityCount(group({ events: [pin({ id: "live" })] }), null, NOW)).toBe(1);
  });
});
