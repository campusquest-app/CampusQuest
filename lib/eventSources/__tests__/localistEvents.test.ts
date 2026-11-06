import { describe, expect, it } from "vitest";
import { eventsLikelyDuplicate } from "@/lib/eventSources/dedupe";
import {
  isAdministrativeLocalistEvent,
  localistPageUrl,
  nextLocalistPage,
  parseLocalistEvents,
  uriEventsWindow,
  type LocalistEvent,
  type LocalistPage,
} from "@/lib/eventSources/adapters/localist";
import { dedupeLogicalEventFields } from "@/lib/realm/dedupeLogicalEvents";
import { preserveRicherImportedFields, uriEventsSyncLockWinner } from "@/lib/server/eventSources/uriEventsSync";
import { officialCampusMapCoordinate } from "@/lib/server/urinvolved/uriCampusBounds";

function localistEvent(overrides: Partial<LocalistEvent> = {}): LocalistEvent {
  return {
    id: 100,
    title: "Campus Club Fair",
    description_text: "Meet student organizations.",
    location_name: "Memorial Union",
    geo: { latitude: "41.486", longitude: "-71.530", street: "1 Campus Ave", city: "Kingston", state: "RI" },
    localist_url: "https://events.uri.edu/event/campus-club-fair",
    photo_url: "https://events.uri.edu/photos/fair.jpg",
    ticket_url: "https://events.uri.edu/event/campus-club-fair/register",
    ticket_cost: "Free",
    publish_status: "published",
    groups: [{ id: 9, name: "Student Senate" }],
    filters: { event_types: [{ name: "Special Events" }], event_audience: [{ name: "Students" }] },
    event_instances: [{ event_instance: { id: 501, start: "2026-11-12T18:00:00-05:00", end: "2026-11-12T20:00:00-05:00" } }],
    ...overrides,
  };
}

describe("URI Events Localist parser", () => {
  it("imports a calendar-only occurrence with organizer, link, image, and official coordinates", () => {
    const parsed = parseLocalistEvents({ events: [{ event: localistEvent() }] });
    expect(parsed.events).toHaveLength(1);
    const event = parsed.events[0]!;
    expect(event.source).toBe("uri_events");
    expect(event.externalId).toBe("100:501");
    expect(event.organizationName).toBe("Student Senate");
    expect(event.eventUrl).toBe("https://events.uri.edu/event/campus-club-fair");
    expect(event.ticketUrl).toContain("/register");
    expect(event.imageUrl).toContain("fair.jpg");
    expect(event.latitude).toBeCloseTo(41.486);
    expect(event.longitude).toBeCloseTo(-71.53);
    expect(event.timezone).toBe("America/New_York");
    expect(event.startsAt).toBe("2026-11-12T18:00:00-05:00");
    expect(event.description).toContain("Cost: Free");
  });

  it("keeps recurring occurrences on different dates as separate events", () => {
    const parsed = parseLocalistEvents({
      events: [
        {
          event: localistEvent({
            event_instances: [
              { event_instance: { id: 1, start: "2026-11-12T18:00:00-05:00", end: null } },
              { event_instance: { id: 2, start: "2026-11-19T18:00:00-05:00", end: null } },
            ],
          }),
        },
      ],
    });
    expect(parsed.events.map((event) => event.externalId)).toEqual(["100:1", "100:2"]);
    expect(eventsLikelyDuplicate(parsed.events[0]!, parsed.events[1]!)).toBe(false);
  });

  it("skips unpublished rows and administrative deadlines that are not student-facing", () => {
    const parsed = parseLocalistEvents({
      events: [
        { event: localistEvent({ id: 1, private: true }) },
        {
          event: localistEvent({
            id: 2,
            title: "Last day to drop courses",
            filters: { event_types: [{ name: "Academic Dates" }] },
          }),
        },
        {
          event: localistEvent({
            id: 3,
            title: "Last day to drop courses workshop",
            filters: { event_types: [{ name: "Workshop" }] },
          }),
        },
      ],
    });
    expect(parsed.skippedUnpublished).toBe(1);
    expect(parsed.skippedAdministrative).toBe(1);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.title).toContain("workshop");
  });

  it("marks cancelled listings without dropping them", () => {
    const parsed = parseLocalistEvents({
      events: [{ event: localistEvent({ status: "canceled" }) }],
    });
    expect(parsed.events[0]?.isCancelled).toBe(true);
  });

  it("does not invent coordinates for an online event or a placeholder pin", () => {
    const online = parseLocalistEvents({
      events: [{ event: localistEvent({ location_name: "Zoom", geo: { latitude: "0", longitude: "0" } }) }],
    });
    expect(online.events[0]?.latitude).toBeNull();
    expect(isAdministrativeLocalistEvent(localistEvent())).toBe(false);
  });
});

describe("URI Events dedupe against URInvolved", () => {
  const calendar = {
    source: "uri_events",
    externalId: "100:501",
    title: "Campus Club Fair!",
    startsAt: "2026-11-12T23:00:00.000Z",
    organizationName: "Student Senate",
    venueName: "Memorial Union",
    eventUrl: "https://events.uri.edu/event/campus-club-fair",
  };
  const involved = {
    source: "urinvolved",
    externalId: "88",
    title: "Campus Club Fair",
    startsAt: "2026-11-12T23:10:00.000Z",
    organizationName: "Student Senate",
    venueName: "Memorial Union Ballroom",
    eventUrl: "https://urinvolved.uri.edu/event/88",
  };

  it("merges the same event when the title punctuation differs and the venue agrees", () => {
    expect(eventsLikelyDuplicate(calendar, involved)).toBe(true);
  });

  it("does not merge the same title on a different date, venue, or session", () => {
    expect(
      eventsLikelyDuplicate(calendar, { ...involved, startsAt: "2026-11-13T23:00:00.000Z" }),
    ).toBe(false);
    expect(
      eventsLikelyDuplicate(calendar, { ...involved, venueName: "Ryan Center", locationName: "Ryan Center" }),
    ).toBe(false);
  });

  it("shows one feed card and keeps both RSVP associations", () => {
    const cards = dedupeLogicalEventFields([
      {
        id: "uri-row",
        source: "uri_events",
        title: "Campus Club Fair",
        startsAt: calendar.startsAt,
        canonicalEventId: "shared",
        organizationName: "Student Senate",
        ticketUrl: "https://events.uri.edu/register",
      },
      {
        id: "urinvolved-row",
        source: "urinvolved",
        title: "Campus Club Fair",
        startsAt: involved.startsAt,
        canonicalEventId: "shared",
        organizationName: null,
        eventUrl: "https://urinvolved.uri.edu/event/88",
      },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.organizationName).toBe("Student Senate");
    expect(cards[0]?.eventUrl).toBe("https://urinvolved.uri.edu/event/88");
    expect(cards[0]?.ticketUrl).toBe("https://events.uri.edu/register");
  });
});

describe("URI Events sync helpers", () => {
  it("paginates a 90-day window and stops on the last page", () => {
    const window = uriEventsWindow(new Date("2026-11-06T15:00:00.000Z"), 90);
    expect(window.start).toBe("2026-11-06");
    expect(window.end).toBe("2027-02-04");
    const url = localistPageUrl({ start: window.start, end: window.end, page: 2, pageSize: 100 });
    expect(url).toContain("start=2026-11-06");
    expect(url).toContain("end=2027-02-04");
    expect(url).toContain("page=2");
    expect(url).not.toContain("featured");
    expect(nextLocalistPage({ current: 1, total: 3, next_page: 2 }, 100, 100)).toBe(2);
    expect(nextLocalistPage({ current: 3, total: 3, next_page: null }, 100, 40)).toBeNull();
  });

  it("repeats an import without replacing richer fields with blanks", () => {
    const page: LocalistPage = { events: [{ event: localistEvent({ description_text: "" }) }] };
    const parsed = parseLocalistEvents(page);
    const incoming = {
      description: "",
      organization_name: null,
      image_url: null,
      latitude: parsed.events[0]?.latitude ?? null,
    };
    const preserved = preserveRicherImportedFields(incoming, {
      description: "Existing longer description",
      organization_name: "Student Senate",
      image_url: "https://events.uri.edu/existing.jpg",
      latitude: 41.48,
    });
    expect(preserved.description).toBe("Existing longer description");
    expect(preserved.organization_name).toBe("Student Senate");
    expect(preserved.image_url).toBe("https://events.uri.edu/existing.jpg");
  });

  it("uses a spring-forward New York date instead of UTC", () => {
    expect(uriEventsWindow(new Date("2026-03-08T04:30:00.000Z"), 1).start).toBe("2026-03-07");
  });

  it("lets the earliest URI Events sync keep the lock", () => {
    expect(
      uriEventsSyncLockWinner([
        { id: "b", startedAt: "2026-11-06T15:20:02.000Z" },
        { id: "a", startedAt: "2026-11-06T15:20:01.000Z" },
      ]),
    ).toBe("a");
    expect(
      uriEventsSyncLockWinner([
        { id: "b", startedAt: "2026-11-06T15:20:01.000Z" },
        { id: "a", startedAt: "2026-11-06T15:20:01.000Z" },
      ]),
    ).toBe("a");
  });

  it("pins only official coordinates that fall on the Kingston campus", () => {
    expect(officialCampusMapCoordinate(41.485199, -71.536278)).toEqual({
      latitude: 41.485199,
      longitude: -71.536278,
    });
    expect(officialCampusMapCoordinate(41.4875, -71.5305)).toBeNull();
    expect(officialCampusMapCoordinate(41.824, -71.4128)).toBeNull();
  });
});
