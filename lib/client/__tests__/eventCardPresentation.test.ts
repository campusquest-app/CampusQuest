import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  eventCardCategoryChip,
  eventCardDisplayTitle,
  eventCardFallbackAccent,
  eventCardImageUrl,
  eventCardPrimaryActionLabel,
  eventCardSportSubtitle,
  eventCardVenueLabel,
  eventMatchesCategoryRail,
  eventShowOnRealmEligible,
  feedEventIsAthletics,
  isEventLive,
} from "@/lib/client/eventCardPresentation";
import { eventSourceChipLabel } from "@/lib/eventSources/catalog";
import type { ExternalFeedEventItem, FeedEvent } from "@/lib/client/eventFeedTypes";

function athleticsEvent(overrides: Partial<ExternalFeedEventItem> = {}): FeedEvent {
  return {
    kind: "external",
    event: {
      id: "game-1",
      source: "athletics",
      title: "University of Rhode Island Men's Basketball vs Holy Cross",
      description: "",
      category: "Athletics",
      location: "Kingston, RI, Thomas M. Ryan Center",
      venueName: "Kingston, RI, Thomas M. Ryan Center",
      address: null,
      startsAt: "2026-11-04T00:00:00.000Z",
      endsAt: null,
      organizationName: "URI Athletics",
      imageUrl: null,
      eventUrl: "https://gorhody.com/calendar.aspx?game_id=12011",
      ticketUrl: null,
      broadcastUrl: null,
      tags: [],
      sport: "Men's Basketball",
      opponent: "Holy Cross",
      homeAway: "home",
      latitude: 41.4865,
      longitude: -71.5298,
      myRsvpStatus: null,
      imported: true,
      ...overrides,
    },
  };
}

describe("event card presentation", () => {
  it("shortens Athletics titles and hides empty optional fields", () => {
    const home = athleticsEvent();
    expect(eventCardDisplayTitle(home)).toBe("Rhode Island vs Holy Cross");
    expect(eventCardSportSubtitle(home)).toBe("Men's Basketball");
    expect(eventCardVenueLabel(home)).toBe("Ryan Center");
    expect(eventCardPrimaryActionLabel(home)).toBe("View Game");
    expect(eventCardSportSubtitle(athleticsEvent({ sport: null }))).toBeNull();
    expect(eventCardVenueLabel(athleticsEvent({ venueName: null, location: "Location TBA" }))).toBeNull();
  });

  it("uses at for away Athletics titles", () => {
    expect(
      eventCardDisplayTitle(
        athleticsEvent({
          title: "University of Rhode Island Football at Merrimack",
          opponent: "Merrimack",
          homeAway: "away",
          sport: "Football",
        }),
      ),
    ).toBe("Rhode Island at Merrimack");
  });

  it("keeps source labels subtle and Athletics as the student category", () => {
    expect(eventSourceChipLabel("athletics")).toBe("Athletics");
    expect(eventSourceChipLabel("urinvolved")).toBe("URInvolved");
    expect(eventSourceChipLabel("manual")).toBe("CampusQuest Verified");
    expect(eventSourceChipLabel("fine_arts")).toBe("Fine Arts");
    expect(feedEventIsAthletics(athleticsEvent())).toBe(true);
    expect(eventCardCategoryChip(athleticsEvent())).toBe("Athletics");
    expect(eventCardImageUrl(athleticsEvent())).toBe("/brand/uri-rams-ri.png");
    expect(eventCardImageUrl(athleticsEvent({ imageUrl: "https://cdn.example/game.jpg" }))).toBe(
      "https://cdn.example/game.jpg",
    );
    expect(eventCardImageUrl(athleticsEvent({ imageUrl: "   " }))).toBe("/brand/uri-rams-ri.png");
  });

  it("keeps the Rams logo for non-athletics events without a photo", () => {
    const arts = athleticsEvent({
      id: "arts-1",
      source: "fine_arts",
      title: "Choir concert",
      category: "Fine Arts",
      sport: null,
      opponent: null,
      homeAway: null,
      venueName: "Fine Arts Center",
      location: "Fine Arts Center",
      imageUrl: null,
    });
    expect(eventCardImageUrl(arts)).toBe("/brand/uri-rams-ri.png");
  });

  it("filters the Arts rail onto Fine Arts events", () => {
    const arts = athleticsEvent({
      id: "arts-1",
      source: "fine_arts",
      title: "Choir concert",
      category: "Fine Arts",
      sport: null,
      opponent: null,
      homeAway: null,
      venueName: "Fine Arts Center",
      location: "Fine Arts Center",
    });
    expect(eventMatchesCategoryRail(arts, "Arts")).toBe(true);
    expect(eventMatchesCategoryRail(athleticsEvent(), "Athletics")).toBe(true);
    expect(eventMatchesCategoryRail(athleticsEvent(), "Arts")).toBe(false);
  });

  it("hides Realm actions for away Athletics and keeps them for mapped home games", () => {
    expect(eventShowOnRealmEligible(athleticsEvent())).toBe(true);
    expect(
      eventShowOnRealmEligible(
        athleticsEvent({
          homeAway: "away",
          venueName: "North Andover, MA",
          location: "North Andover, MA",
          latitude: 41.4865,
          longitude: -71.5298,
        }),
      ),
    ).toBe(false);
  });
});

describe("isEventLive", () => {
  const startsAt = "2026-10-06T22:00:00.000Z";
  const endsAt = "2026-10-07T00:00:00.000Z";

  it("hides an event that starts in 2 hours", () => {
    expect(isEventLive(athleticsEvent({ startsAt, endsAt }), new Date("2026-10-06T20:00:00.000Z"))).toBe(false);
  });

  it("shows an event at the start instant", () => {
    expect(isEventLive(athleticsEvent({ startsAt, endsAt }), new Date(startsAt))).toBe(true);
  });

  it("shows an event halfway through", () => {
    expect(isEventLive(athleticsEvent({ startsAt, endsAt }), new Date("2026-10-06T23:00:00.000Z"))).toBe(true);
  });

  it("hides an event one minute after it ends", () => {
    expect(isEventLive(athleticsEvent({ startsAt, endsAt }), new Date("2026-10-07T00:01:00.000Z"))).toBe(false);
  });

  it("keeps the event live at the exact end instant", () => {
    expect(isEventLive(athleticsEvent({ startsAt, endsAt }), new Date(endsAt))).toBe(true);
  });

  it("hides an event tomorrow", () => {
    expect(
      isEventLive(
        athleticsEvent({
          startsAt: "2026-10-07T22:00:00.000Z",
          endsAt: "2026-10-08T00:00:00.000Z",
        }),
        new Date("2026-10-06T22:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("hides malformed or missing start times", () => {
    const now = new Date("2026-10-06T22:30:00.000Z");
    expect(isEventLive(athleticsEvent({ startsAt: "not-a-time", endsAt }), now)).toBe(false);
    expect(isEventLive(athleticsEvent({ startsAt: null, endsAt }), now)).toBe(false);
    expect(isEventLive(athleticsEvent({ startsAt: "", endsAt }), now)).toBe(false);
  });

  it("reuses the two-hour campus default when the end time is missing", () => {
    expect(isEventLive(athleticsEvent({ startsAt, endsAt: null }), new Date("2026-10-06T23:00:00.000Z"))).toBe(true);
    expect(isEventLive(athleticsEvent({ startsAt, endsAt: null }), new Date("2026-10-07T00:00:00.000Z"))).toBe(true);
    expect(isEventLive(athleticsEvent({ startsAt, endsAt: null }), new Date("2026-10-07T00:01:00.000Z"))).toBe(false);
    expect(isEventLive(athleticsEvent({ startsAt, endsAt: null }), new Date("2026-10-06T20:00:00.000Z"))).toBe(false);
  });

  it("prefers a real end over the two-hour default", () => {
    const shortEnd = "2026-10-06T22:30:00.000Z";
    expect(isEventLive(athleticsEvent({ startsAt, endsAt: shortEnd }), new Date("2026-10-06T22:20:00.000Z"))).toBe(
      true,
    );
    expect(isEventLive(athleticsEvent({ startsAt, endsAt: shortEnd }), new Date("2026-10-06T22:31:00.000Z"))).toBe(
      false,
    );
  });

  it("stays live across midnight when the stored end is after midnight", () => {
    const lateStart = "2026-10-07T03:30:00.000Z";
    const afterMidnight = "2026-10-07T04:30:00.000Z";
    expect(
      isEventLive(athleticsEvent({ startsAt: lateStart, endsAt: afterMidnight }), new Date("2026-10-07T04:00:00.000Z")),
    ).toBe(true);
    expect(
      isEventLive(athleticsEvent({ startsAt: lateStart, endsAt: afterMidnight }), new Date("2026-10-07T04:31:00.000Z")),
    ).toBe(false);
  });

  it("uses absolute instants across the daylight-saving change", () => {
    const dstStart = "2026-03-08T06:30:00.000Z";
    const dstEnd = "2026-03-08T07:30:00.000Z";
    expect(isEventLive(athleticsEvent({ startsAt: dstStart, endsAt: dstEnd }), new Date("2026-03-08T07:00:00.000Z"))).toBe(
      true,
    );
    expect(isEventLive(athleticsEvent({ startsAt: dstStart, endsAt: dstEnd }), new Date("2026-03-08T07:31:00.000Z"))).toBe(
      false,
    );
  });

  it("gates Show on Realm cards on the shared live helper", () => {
    const discovery = readFileSync("components/events/EventDiscoveryCard.tsx", "utf8");
    const happening = readFileSync("components/events/HappeningSoonCarousel.tsx", "utf8");
    expect(discovery).toContain("isEventLive(item, now)");
    expect(happening).toContain("isEventLive(item, now)");
    expect(happening).toContain("isEventLive(row.item, now)");
  });
});
