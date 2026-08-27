import { describe, expect, it } from "vitest";
import { eventSourceActionLabel, eventSourceChipLabel, eventSourceLabel } from "@/lib/eventSources/catalog";
import { canonicalEventCategory } from "@/lib/eventSources/categories";
import { eventsLikelyDuplicate } from "@/lib/eventSources/dedupe";
import { parseIcsEvents } from "@/lib/eventSources/ics";
import {
  athleticsIcsToNormalized,
  parseAthleticsFeed,
  parseAthleticsTitle,
} from "@/lib/eventSources/adapters/athletics";
import { athleticsFeedConfigured } from "@/lib/server/eventSources/athleticsSync";

describe("event source catalog", () => {
  it("keeps URInvolved copy for the existing detail CTA", () => {
    expect(eventSourceActionLabel("urinvolved")).toBe("More Info on URInvolved");
    expect(eventSourceLabel("urinvolved")).toBe("URInvolved");
    expect(eventSourceChipLabel("campusquest")).toBeNull();
    expect(eventSourceChipLabel("manual")).toBe("CampusQuest Verified");
    expect(eventSourceChipLabel("athletics")).toBe("Athletics");
  });
});

describe("canonical event categories", () => {
  it("maps athletics and keyword sources onto the shared category list", () => {
    expect(canonicalEventCategory({ source: "athletics", title: "URI vs RIC" })).toBe("Athletics");
    expect(canonicalEventCategory({ source: "urinvolved", category: "Social / Gatherings" })).toBe("Social");
    expect(canonicalEventCategory({ source: "urinvolved", title: "Career fair resume reviews" })).toBe("Career");
    expect(canonicalEventCategory({ source: "fine_arts", title: "Choir concert" })).toBe("Fine Arts");
  });
});

describe("cross-source dedupe", () => {
  it("links the same game from two providers without merging a different sport", () => {
    const athletics = {
      source: "athletics",
      title: "Men's Basketball vs Rhode Island College",
      startsAt: "2026-11-12T00:00:00.000Z",
      venueName: "Ryan Center",
      opponent: "Rhode Island College",
      sport: "Basketball",
    };
    const urinvolved = {
      source: "urinvolved",
      title: "URI Men's Basketball vs RIC",
      startsAt: "2026-11-12T00:10:00.000Z",
      venueName: "Thomas M. Ryan Center",
      opponent: "Rhode Island College",
      sport: "Basketball",
    };
    expect(eventsLikelyDuplicate(athletics, urinvolved)).toBe(true);
    expect(
      eventsLikelyDuplicate(athletics, {
        ...urinvolved,
        sport: "Soccer",
        opponent: "Providence",
        title: "URI Men's Soccer vs Providence",
      }),
    ).toBe(false);
  });

  it("does not merge men's and women's games with the same opponent", () => {
    expect(
      eventsLikelyDuplicate(
        {
          source: "athletics",
          title: "University of Rhode Island Women's Soccer vs Providence",
          startsAt: "2026-09-12T23:00:00.000Z",
          opponent: "Providence",
          sport: "Women's Soccer",
        },
        {
          source: "urinvolved",
          title: "URI Men's Soccer vs Providence",
          startsAt: "2026-09-12T23:00:00.000Z",
          opponent: "Providence",
          sport: "Men's Soccer",
        },
      ),
    ).toBe(false);
  });

  it("does not merge events that only share a vague title token", () => {
    expect(
      eventsLikelyDuplicate(
        {
          title: "Welcome Back Picnic",
          startsAt: "2026-09-01T16:00:00.000Z",
          organizationName: "Student Senate",
          venueName: "Quad",
        },
        {
          title: "Welcome Back Concert",
          startsAt: "2026-09-01T16:00:00.000Z",
          organizationName: "Fine Arts",
          venueName: "Fine Arts Center",
        },
      ),
    ).toBe(false);
  });
});

describe("athletics adapter", () => {
  it("parses ICS without inventing extra games", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:game-1",
      "SUMMARY:Men's Basketball vs Rhode Island College",
      "DTSTART:20261112T000000Z",
      "DTEND:20261112T020000Z",
      "LOCATION:Ryan Center",
      "URL:https://gorhody.com/sports/mbball/events/1",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const events = athleticsIcsToNormalized(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.sport).toBe("Men's Basketball");
    expect(events[0]?.opponent).toBe("Rhode Island College");
    expect(events[0]?.source).toBe("athletics");
    expect(parseIcsEvents("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual([]);
    expect(parseAthleticsFeed("{\"events\":[]}", "json")).toEqual([]);
  });

  it("extracts home/away from titles", () => {
    expect(parseAthleticsTitle("Men's Soccer at UMass").homeAway).toBe("away");
    expect(parseAthleticsTitle("Women's Volleyball vs Fordham").homeAway).toBe("home");
  });

  it("does not treat an unconfigured feed as a live source", () => {
    const previous = process.env.URI_ATHLETICS_FEED_URL;
    const previousMany = process.env.URI_ATHLETICS_FEED_URLS;
    delete process.env.URI_ATHLETICS_FEED_URL;
    delete process.env.URI_ATHLETICS_FEED_URLS;
    expect(athleticsFeedConfigured()).toBe(false);
    if (previous) process.env.URI_ATHLETICS_FEED_URL = previous;
    if (previousMany) process.env.URI_ATHLETICS_FEED_URLS = previousMany;
  });
});
