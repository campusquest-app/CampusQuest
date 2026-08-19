import { describe, expect, it } from "vitest";
import {
  buildDiscoveryEventImageUrl,
  parseUrinvolvedDiscoveryEvents,
} from "@/lib/server/urinvolved/parseDiscoveryEvents";
import {
  decideSoftDeactivateMissingEvents,
  idsMissingFromSeen,
} from "@/lib/server/urinvolved/syncSafety";
import { getLogicalEventFallbackKey } from "@/lib/realm/dedupeLogicalEvents";
import { dedupeLogicalEventFields } from "@/lib/realm/dedupeLogicalEvents";

describe("parseUrinvolvedDiscoveryEvents", () => {
  it("parses upcoming discovery rows including image CDN and cancelled status", () => {
    const events = parseUrinvolvedDiscoveryEvents([
      {
        id: "12487762",
        name: "Resource Fair",
        description: "<p>Hello <strong>campus</strong></p>",
        location: "Memorial Union Ballroom, Atrium 1",
        startsOn: "2026-09-08T14:00:00+00:00",
        endsOn: "2026-09-08T16:00:00+00:00",
        imagePath: "abc.png",
        organizationName: "MAVE",
        categoryNames: ["New Students", "Social / Gatherings"],
        status: "Approved",
        visibility: "Public",
      },
      {
        id: 99,
        name: "Cancelled Mixer",
        startsOn: "2026-09-09T18:00:00+00:00",
        endsOn: null,
        status: "Canceled",
        organizationNames: ["Student Senate"],
        categoryNames: ["Social"],
      },
      {
        id: "",
        name: "Missing id",
      },
      {
        id: "1",
        name: "",
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]?.externalId).toBe("12487762");
    expect(events[0]?.description).toContain("Hello");
    expect(events[0]?.description).not.toContain("<");
    expect(events[0]?.venueName).toBe("Memorial Union Ballroom, Atrium 1");
    expect(events[0]?.startsAt).toBe("2026-09-08T14:00:00.000Z");
    expect(events[0]?.imageUrl).toContain("se-images.campuslabs.com");
    expect(events[0]?.organizationName).toBe("MAVE");
    expect(events[1]?.organizationName).toBe("Student Senate");
    expect(events[1]?.tags).toContain("cancelled");
    expect(events[1]?.endsAt).toBeNull();
  });

  it("keeps same-location events with different titles as separate logical events", () => {
    const events = parseUrinvolvedDiscoveryEvents([
      {
        id: "1",
        name: "Movie Night A",
        location: "Quad",
        startsOn: "2026-09-14T23:00:00+00:00",
        organizationName: "Student Activities",
      },
      {
        id: "2",
        name: "Movie Night B",
        location: "Quad",
        startsOn: "2026-09-14T23:00:00+00:00",
        organizationName: "Student Activities",
      },
    ]);
    expect(events).toHaveLength(2);
    const keys = events.map((e) =>
      getLogicalEventFallbackKey({
        title: e.title,
        startsAt: e.startsAt,
        organizationName: e.organizationName,
        locationName: e.locationName,
        eventUrl: e.eventUrl,
      }),
    );
    expect(keys[0]).not.toEqual(keys[1]);
  });

  it("builds discovery image URLs", () => {
    expect(buildDiscoveryEventImageUrl("path.png")).toContain("path.png");
    expect(buildDiscoveryEventImageUrl(null, "https://cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
    expect(buildDiscoveryEventImageUrl(null)).toBeNull();
  });
});

describe("URInvolved soft-deactivate safety", () => {
  it("does not deactivate when upstream fetch failed", () => {
    expect(
      decideSoftDeactivateMissingEvents({
        fetchAttempted: true,
        fetchSucceeded: false,
        eventsFetched: 0,
      }),
    ).toEqual({ shouldDeactivate: false, reason: "fetch_failed" });
  });

  it("does not deactivate when fetch was never attempted", () => {
    expect(
      decideSoftDeactivateMissingEvents({
        fetchAttempted: false,
        fetchSucceeded: false,
        eventsFetched: 0,
      }),
    ).toEqual({ shouldDeactivate: false, reason: "fetch_not_attempted" });
  });

  it("allows deactivate after successful catalog (including empty legitimate)", () => {
    expect(
      decideSoftDeactivateMissingEvents({
        fetchAttempted: true,
        fetchSucceeded: true,
        eventsFetched: 12,
      }).shouldDeactivate,
    ).toBe(true);
    expect(
      decideSoftDeactivateMissingEvents({
        fetchAttempted: true,
        fetchSucceeded: true,
        eventsFetched: 0,
      }),
    ).toEqual({ shouldDeactivate: true, reason: "empty_legitimate_catalog" });
  });

  it("preserves stored ids that were seen and only marks missing ones", () => {
    expect(idsMissingFromSeen(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });
});

describe("upcoming filtering helpers used by Events API path", () => {
  const PAST_GRACE_MS = 2 * 60 * 60 * 1000;

  function isUpcoming(startsAt: string | null, nowMs: number): boolean {
    if (!startsAt) return true;
    return new Date(startsAt).getTime() >= nowMs - PAST_GRACE_MS;
  }

  it("keeps events inside the 2h past grace and drops older ones", () => {
    const now = Date.parse("2026-08-19T16:00:00.000Z");
    expect(isUpcoming("2026-08-19T15:00:00.000Z", now)).toBe(true);
    expect(isUpcoming("2026-08-19T13:59:00.000Z", now)).toBe(false);
    expect(isUpcoming("2026-09-08T14:00:00.000Z", now)).toBe(true);
  });

  it("treats America/New_York wall times via stored UTC ISO correctly", () => {
    // 10am EDT on Sept 8 == 14:00 UTC
    const startsAt = "2026-09-08T14:00:00.000Z";
    const now = Date.parse("2026-08-19T15:00:00.000Z");
    expect(isUpcoming(startsAt, now)).toBe(true);
    expect(new Date(startsAt).toLocaleString("en-US", { timeZone: "America/New_York" })).toContain(
      "9/8/2026",
    );
  });

  it("keeps all-day-style events that only have a start", () => {
    const events = parseUrinvolvedDiscoveryEvents([
      {
        id: "allday",
        name: "Welcome Fair",
        startsOn: "2026-09-01T04:00:00+00:00",
        endsOn: null,
        location: "Quad",
      },
    ]);
    expect(events[0]?.endsAt).toBeNull();
    expect(events[0]?.startsAt).toBeTruthy();
  });

  it("does not collapse distinct events at the same location during list dedupe", () => {
    const deduped = dedupeLogicalEventFields([
      {
        title: "Clinic A",
        startsAt: "2026-09-10T13:00:00.000Z",
        organizationName: "Health",
        locationName: "Health Services",
        sourceExternalId: "1",
        eventUrl: "https://urinvolved.uri.edu/event/1",
      },
      {
        title: "Clinic B",
        startsAt: "2026-09-10T13:00:00.000Z",
        organizationName: "Health",
        locationName: "Health Services",
        sourceExternalId: "2",
        eventUrl: "https://urinvolved.uri.edu/event/2",
      },
    ]);
    expect(deduped).toHaveLength(2);
  });
});
