import { describe, expect, it } from "vitest";
import {
  eventCardCategoryChip,
  eventCardDisplayTitle,
  eventCardPrimaryActionLabel,
  eventCardSportSubtitle,
  eventCardVenueLabel,
  eventMatchesCategoryRail,
  eventShowOnRealmEligible,
  feedEventIsAthletics,
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
