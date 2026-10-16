import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeMapLocationGroups } from "@/lib/mapLocationGroups";
import { mapEventPinToFeedEvent, resolveGroupedMarkerTap } from "@/lib/realm/mapEventPinToFeedEvent";
import { REVIEW_DEMO_EVENTS, REVIEW_DEMO_IDS } from "@/lib/reviewDemoSeed";
import { listReviewDemoMapLocations } from "@/lib/server/groupedMapLocations";

const NOW_MS = Date.parse("2026-10-14T22:00:00.000Z");

async function demoGroups() {
  const rows = REVIEW_DEMO_EVENTS.map((event, index) => ({
    id: REVIEW_DEMO_IDS.events[index],
    title: event.title,
    starts_at: new Date(NOW_MS + event.startOffsetMs).toISOString(),
    ends_at: new Date(NOW_MS + event.startOffsetMs + event.durationMs).toISOString(),
    location_name: event.locationName,
    is_cancelled: false,
    host_organization_id: event.host.kind === "org" ? event.host.orgId : null,
    student_organizations:
      event.host.kind === "org"
        ? { name: event.host.orgId === REVIEW_DEMO_IDS.hikingClub ? "[Demo] URI Hiking Club" : "[Demo] Greek Chapter" }
        : null,
  }));
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => Promise.resolve({ data: rows, error: null }),
  };
  // Freeze visibility to the same clock the fixture offsets were authored against.
  return listReviewDemoMapLocations({ from: () => query } as never, new Date(NOW_MS));
}

describe("review demo map marker interactions", () => {
  it("attaches every demo event to a tappable landmark with coordinates", async () => {
    const groups = await demoGroups();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.attachToLandmark).toBe(true);
      expect(group.realmLocationId).toBeTruthy();
      expect(group.lat).toEqual(expect.any(Number));
      expect(group.lng).toEqual(expect.any(Number));
      expect(resolveGroupedMarkerTap(group, new Date(NOW_MS))).toEqual({
        kind: "location-sheet",
        markerId: group.realmLocationId,
        realmLocationId: group.realmLocationId,
      });
    }
  });

  it("keeps demo event and organization ids for event/org detail", async () => {
    const groups = await demoGroups();
    const events = groups.flatMap((group) => group.events);
    expect(events.map((event) => event.id).sort()).toEqual([...REVIEW_DEMO_IDS.events].sort());

    const hike = events.find((event) => event.id === REVIEW_DEMO_IDS.events[2]);
    expect(hike?.organizationId).toBe(REVIEW_DEMO_IDS.hikingClub);
    expect(hike?.locationText).toMatch(/quad/i);
    const feed = mapEventPinToFeedEvent(hike!);
    expect(feed.kind).toBe("campus");
    if (feed.kind !== "campus") return;
    expect(feed.event.id).toBe(REVIEW_DEMO_IDS.events[2]);
    expect(feed.event.hostOrganization?.id).toBe(REVIEW_DEMO_IDS.hikingClub);
    expect(feed.event.location).toMatch(/quad/i);
  });

  it("merges demo events onto the same landmark tap target students already use", async () => {
    const demo = await demoGroups();
    const quad = demo.find((group) => group.realmLocationId === "the-quad");
    expect(quad).toBeTruthy();
    const base = [
      {
        ...quad!,
        events: [],
        quests: [],
        qrCodes: [],
      },
    ];
    const merged = mergeMapLocationGroups(base, demo);
    const mergedQuad = merged.find((group) => group.groupKey === quad!.groupKey);
    expect(mergedQuad?.events.some((event) => event.title.includes("[Demo]"))).toBe(true);
    expect(resolveGroupedMarkerTap(mergedQuad!, new Date(NOW_MS)).kind).toBe("location-sheet");
  });

  it("opens event detail for a standalone single-event demo pin", () => {
    const tap = resolveGroupedMarkerTap(
      {
        groupKey: "demo-standalone",
        locationKey: null,
        realmLocationId: null,
        locationName: "Demo Lawn",
        locationAddress: null,
        x: 50,
        y: 50,
        lat: 41.487,
        lng: -71.53,
        attachToLandmark: false,
        qrCodes: [],
        quests: [],
        events: [
          {
            id: REVIEW_DEMO_IDS.events[0],
            title: "[Demo] Coffee & Code Meetup",
            startsAt: new Date(NOW_MS - 30 * 60 * 1000).toISOString(),
            endsAt: new Date(NOW_MS + 90 * 60 * 1000).toISOString(),
            organizationName: null,
            organizationId: null,
            eventUrl: null,
            locationText: "Memorial Union",
          },
        ],
      },
      new Date(NOW_MS),
    );
    expect(tap.kind).toBe("event-detail");
    if (tap.kind !== "event-detail") return;
    expect(tap.pin.id).toBe(REVIEW_DEMO_IDS.events[0]);
  });

  it("loads demo pins from the isolated review-demo route, not the shared cache", () => {
    const client = readFileSync(join(process.cwd(), "lib/client/mapLocationGroupsClient.ts"), "utf8");
    expect(client).toContain("/api/quests/map-pins/review-demo");
    expect(client).toMatch(/eligible === true/);
  });
});
