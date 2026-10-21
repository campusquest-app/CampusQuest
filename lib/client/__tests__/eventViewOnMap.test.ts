import { describe, expect, it } from "vitest";
import type { CampusEventItem, ExternalFeedEventItem, FeedEvent } from "@/lib/client/eventFeedTypes";
import {
  eventHasVerifiedMapLocation,
  eventIsViewOnMapTimingEligible,
  eventViewOnMapEligible,
  findExactCampusLocationId,
} from "@/lib/client/eventViewOnMap";
import {
  isFocusedMapEvent,
  orderEventsForFocusedSelection,
  pickFeaturedEvent,
} from "@/components/realm/locationDetail/LocationUpcomingHighlight";
import type { MapEventPin } from "@/lib/mapLocationGroups";

const NOW = new Date("2026-10-21T15:00:00-04:00");

function campusEvent(overrides: Partial<CampusEventItem> = {}): FeedEvent {
  return {
    kind: "campus",
    event: {
      id: "campus-1",
      title: "Campus Meetup",
      description: "Hello",
      category: "Social",
      location: "Memorial Union",
      startsAt: "2026-10-21T18:00:00-04:00",
      endsAt: "2026-10-21T20:00:00-04:00",
      isPaid: false,
      hostOrganization: null,
      rsvpCount: 0,
      myRsvpStatus: null,
      isCancelled: false,
      ...overrides,
    },
  };
}

function externalEvent(overrides: Partial<ExternalFeedEventItem> = {}): FeedEvent {
  return {
    kind: "external",
    event: {
      id: "ext-1",
      source: "urinvolved",
      title: "Club Night",
      description: "Hello",
      category: "Social",
      location: null,
      venueName: "Memorial Union",
      address: null,
      startsAt: "2026-10-21T18:00:00-04:00",
      endsAt: "2026-10-21T20:00:00-04:00",
      organizationName: "URI Club",
      imageUrl: null,
      eventUrl: null,
      tags: [],
      latitude: 41.4868,
      longitude: -71.5301,
      myRsvpStatus: null,
      imported: true,
      isCancelled: false,
      ...overrides,
    },
  };
}

function pin(overrides: Partial<MapEventPin> = {}): MapEventPin {
  return {
    id: "pin-1",
    title: "Event",
    startsAt: "2026-10-21T18:00:00.000Z",
    endsAt: "2026-10-21T20:00:00.000Z",
    organizationName: null,
    eventUrl: null,
    cancelled: false,
    ...overrides,
  };
}

describe("findExactCampusLocationId", () => {
  it("matches catalog names exactly and rejects near-misses", () => {
    expect(findExactCampusLocationId("Memorial Union")).toBe("memorial-union");
    expect(findExactCampusLocationId("memorial union")).toBe("memorial-union");
    expect(findExactCampusLocationId("Memorial Union Annex")).toBeNull();
    expect(findExactCampusLocationId("Location TBA")).toBeNull();
    expect(findExactCampusLocationId(null)).toBeNull();
  });
});

describe("eventViewOnMapEligible", () => {
  it("shows for upcoming campus events at an exact catalog venue", () => {
    expect(eventViewOnMapEligible(campusEvent(), NOW)).toBe(true);
  });

  it("shows for live external events with verified coordinates", () => {
    const live = externalEvent({
      startsAt: "2026-10-21T14:00:00-04:00",
      endsAt: "2026-10-21T16:00:00-04:00",
    });
    expect(eventIsViewOnMapTimingEligible(live, NOW)).toBe(true);
    expect(eventHasVerifiedMapLocation(live)).toBe(true);
    expect(eventViewOnMapEligible(live, NOW)).toBe(true);
  });

  it("hides ended, canceled, and unresolved locations", () => {
    expect(
      eventViewOnMapEligible(
        campusEvent({ startsAt: "2026-10-20T10:00:00-04:00", endsAt: "2026-10-20T11:00:00-04:00" }),
        NOW,
      ),
    ).toBe(false);
    expect(eventViewOnMapEligible(campusEvent({ isCancelled: true }), NOW)).toBe(false);
    expect(eventViewOnMapEligible(campusEvent({ title: "Meetup (Cancelled)" }), NOW)).toBe(false);
    expect(eventViewOnMapEligible(campusEvent({ location: "Location TBA" }), NOW)).toBe(false);
    expect(eventViewOnMapEligible(campusEvent({ location: "Some Random Room 214" }), NOW)).toBe(false);
    expect(
      eventViewOnMapEligible(
        externalEvent({ latitude: null, longitude: null, venueName: "Almost Memorial Union" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("hides away athletics even with coordinates", () => {
    expect(
      eventViewOnMapEligible(
        externalEvent({ source: "athletics", homeAway: "away", venueName: "North Andover, MA" }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("focused event selection in location sheet", () => {
  it("features and orders the student-selected event when multiple share a venue", () => {
    const events = [
      pin({ id: "a", title: "Earlier", startsAt: "2026-10-21T16:00:00.000Z" }),
      pin({ id: "b", title: "Selected", startsAt: "2026-10-21T19:00:00.000Z", externalEventId: "ext-b" }),
      pin({ id: "c", title: "Later", startsAt: "2026-10-21T21:00:00.000Z" }),
    ];
    expect(pickFeaturedEvent(events, NOW, "ext-b")?.id).toBe("b");
    expect(orderEventsForFocusedSelection(events, "ext-b").map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(isFocusedMapEvent(events[1]!, "ext-b")).toBe(true);
    expect(isFocusedMapEvent(events[0]!, "ext-b")).toBe(false);
  });
});
