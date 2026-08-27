import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  athleticsFeedUrlsFromEnv,
  athleticsHighlightRelation,
  athleticsIcsToNormalized,
  parseAthleticsFeed,
  parseAthleticsTitle,
} from "@/lib/eventSources/adapters/athletics";
import { athleticsEventEligibleForCampusMap } from "@/lib/eventSources/athleticsMapEligibility";
import { eventsLikelyDuplicate } from "@/lib/eventSources/dedupe";
import { parseIcsEvents } from "@/lib/eventSources/ics";
import { getLogicalEventKey } from "@/lib/realm/dedupeLogicalEvents";
import { athleticsFeedConfigured } from "@/lib/server/eventSources/athleticsSync";

const REAL_HOME_BASKETBALL = [
  "BEGIN:VCALENDAR",
  "PRODID:-//SIDEARM Sports//NONSGML SIDEARM//EN",
  "BEGIN:VEVENT",
  "UID:vcal_12011-gorhody.com",
  "DTSTAMP:20260827T001725Z",
  "DTSTART:20261104T000000Z",
  "DTEND:20261104T020000Z",
  "LOCATION:Kingston\\, RI, Thomas M. Ryan Center",
  "SUMMARY:University of Rhode Island Men's Basketball vs Holy Cross",
  "DESCRIPTION:University of Rhode Island Men's Basketball vs Holy Cross\\n",
  "URL:https://gorhody.com/calendar.aspx?game_id=12011&amp;sport_id=4",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

const REAL_AWAY_FOOTBALL = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:vcal_11747-gorhody.com",
  "DTSTART:20260828T220000Z",
  "DTEND:20260829T010000Z",
  "LOCATION:North Andover\\, MA",
  "SUMMARY:University of Rhode Island Football at Merrimack",
  "DESCRIPTION:University of Rhode Island Football at Merrimack\\nStreaming Video: https://www.espn.com/watch/player/_/id/64ba31c0-fee2-4d05-a8f0-779443899301\\nTickets: https://tickets.merrimackathletics.com/event/merrimack-football-vs-rhode-island-s6voj9\\n",
  "URL:https://gorhody.com/calendar.aspx?game_id=11747&amp;sport_id=2",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

const REAL_HOME_VOLLEYBALL = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:vcal_11933-gorhody.com",
  "DTSTART:20260904T230000Z",
  "DTEND:20260905T010000Z",
  "LOCATION:Kingston\\, R.I., Keaney Gymnasium",
  "SUMMARY:University of Rhode Island Women's Volleyball vs Bryant",
  "DESCRIPTION:University of Rhode Island Women's Volleyball vs Bryant\\nStreaming Video: https://www.espn.com/watch/player/_/eventCalendarId/401885726\\n",
  "URL:https://gorhody.com/calendar.aspx?game_id=11933&amp;sport_id=17",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

const REAL_COMPLETED_SOCCER = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:vcal_11981-gorhody.com",
  "DTSTART:20260812T230000Z",
  "DTEND:20260813T010000Z",
  "LOCATION:Kingston\\, R.I., URI Soccer Complex",
  "SUMMARY:[W] University of Rhode Island Women's Soccer vs Maine",
  "DESCRIPTION:[W] University of Rhode Island Women's Soccer vs Maine\\nW 1-0\\nStreaming Video: https://www.espn.com/search/_/q/rhode island/o/watch/appearance/dark\\n",
  "URL:https://gorhody.com/calendar.aspx?game_id=11981&amp;sport_id=13",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

describe("official URI Athletics ICS format", () => {
  it("parses a real Sidearm home basketball VEVENT", () => {
    const [event] = athleticsIcsToNormalized(REAL_HOME_BASKETBALL);
    expect(event).toMatchObject({
      source: "athletics",
      sourceType: "athletics",
      externalId: "vcal_12011-gorhody.com",
      title: "University of Rhode Island Men's Basketball vs Holy Cross",
      sport: "Men's Basketball",
      opponent: "Holy Cross",
      homeAway: "home",
      venueName: "Kingston, RI, Thomas M. Ryan Center",
      eventUrl: "https://gorhody.com/calendar.aspx?game_id=12011&sport_id=4",
    });
    expect(event?.startsAt).toBe("2026-11-04T00:00:00.000Z");
    expect(athleticsEventEligibleForCampusMap({ source: "athletics", homeAway: event?.homeAway })).toBe(true);
  });

  it("parses a real away football VEVENT with optional ticket and watch URLs", () => {
    const [event] = athleticsIcsToNormalized(REAL_AWAY_FOOTBALL);
    expect(event?.homeAway).toBe("away");
    expect(event?.sport).toBe("Football");
    expect(event?.opponent).toBe("Merrimack");
    expect(event?.ticketUrl).toContain("tickets.merrimackathletics.com");
    expect(event?.broadcastUrl).toContain("espn.com/watch");
    expect(athleticsEventEligibleForCampusMap({ source: "athletics", homeAway: "away" })).toBe(false);
  });

  it("keeps women's volleyball distinct from other sports at Keaney", () => {
    const [event] = athleticsIcsToNormalized(REAL_HOME_VOLLEYBALL);
    expect(event?.sport).toBe("Women's Volleyball");
    expect(event?.opponent).toBe("Bryant");
    expect(event?.venueName).toContain("Keaney Gymnasium");
  });

  it("strips Sidearm result prefixes and records the published score", () => {
    const [event] = athleticsIcsToNormalized(REAL_COMPLETED_SOCCER);
    expect(event?.title).toBe("University of Rhode Island Women's Soccer vs Maine");
    expect(event?.score).toBe("W 1-0");
    expect(event?.liveStatus).toBe("final");
    expect(event?.sport).toBe("Women's Soccer");
  });

  it("parses multi-sport calendars without inventing games", () => {
    const events = athleticsIcsToNormalized([REAL_HOME_BASKETBALL, REAL_AWAY_FOOTBALL, REAL_HOME_VOLLEYBALL].join("\n"));
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.sport))).toEqual(
      new Set(["Men's Basketball", "Football", "Women's Volleyball"]),
    );
  });

  it("treats a second parse of the same feed as the same external ids", () => {
    const first = athleticsIcsToNormalized(REAL_HOME_BASKETBALL).map((event) => event.externalId);
    const second = athleticsIcsToNormalized(REAL_HOME_BASKETBALL).map((event) => event.externalId);
    expect(second).toEqual(first);
    expect(first).toEqual(["vcal_12011-gorhody.com"]);
  });

  it("leaves missing optional URLs null", () => {
    const [event] = athleticsIcsToNormalized(REAL_HOME_BASKETBALL);
    expect(event?.ticketUrl).toBeNull();
    expect(event?.broadcastUrl).toBeNull();
    expect(event?.eventUrl).toBeTruthy();
  });

  it("marks cancelled and postponed Sidearm events without fabricating a replacement game", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:vcal_cancelled-gorhody.com",
      "DTSTART:20260901T230000Z",
      "SUMMARY:University of Rhode Island Women's Soccer vs Fordham (Cancelled)",
      "STATUS:CANCELLED",
      "LOCATION:Kingston\\, RI, URI Soccer Complex",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:vcal_postponed-gorhody.com",
      "DTSTART:20260902T230000Z",
      "SUMMARY:University of Rhode Island Women's Soccer vs Fordham - Postponed",
      "LOCATION:Kingston\\, RI, URI Soccer Complex",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const events = athleticsIcsToNormalized(ics);
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.isCancelled)).toBe(true);
    expect(events.every((event) => event.liveStatus === "cancelled")).toBe(true);
  });

  it("skips malformed records that have no start time", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:broken",
      "SUMMARY:University of Rhode Island Football vs Elon",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseIcsEvents(ics)).toEqual([]);
    expect(athleticsIcsToNormalized(ics)).toEqual([]);
  });

  it("does not invent events from an unavailable HTML error page", () => {
    expect(parseAthleticsFeed("<html>Forbidden</html>", "ics")).toEqual([]);
    expect(parseAthleticsFeed("{\"events\":[]}", "json")).toEqual([]);
  });
});

describe("athletics feed configuration", () => {
  it("keeps URI_ATHLETICS_FEED_URL and optional URI_ATHLETICS_FEED_URLS compatible", () => {
    expect(
      athleticsFeedUrlsFromEnv({
        URI_ATHLETICS_FEED_URL: "https://gorhody.com/calendar.ashx/calendar.ics",
        URI_ATHLETICS_FEED_URLS: "https://gorhody.com/calendar.ashx/calendar.ics,https://example.invalid/extra.ics",
      }),
    ).toEqual([
      "https://gorhody.com/calendar.ashx/calendar.ics",
      "https://example.invalid/extra.ics",
    ]);
  });

  it("treats URI_ATHLETICS_FEED_URLS alone as configured", () => {
    const previous = process.env.URI_ATHLETICS_FEED_URL;
    const previousMany = process.env.URI_ATHLETICS_FEED_URLS;
    delete process.env.URI_ATHLETICS_FEED_URL;
    process.env.URI_ATHLETICS_FEED_URLS = "https://gorhody.com/calendar.ashx/calendar.ics";
    expect(athleticsFeedConfigured()).toBe(true);
    delete process.env.URI_ATHLETICS_FEED_URLS;
    expect(athleticsFeedConfigured()).toBe(false);
    if (previous) process.env.URI_ATHLETICS_FEED_URL = previous;
    if (previousMany) process.env.URI_ATHLETICS_FEED_URLS = previousMany;
  });
});

describe("athletics identity and dedupe", () => {
  it("keeps the same numeric external id unique per provider", () => {
    expect(
      getLogicalEventKey({
        title: "Club meeting",
        source: "urinvolved",
        sourceExternalId: "123",
      }),
    ).toBe("external:urinvolved:123");
    expect(
      getLogicalEventKey({
        title: "URI vs Maine",
        source: "athletics",
        sourceExternalId: "123",
      }),
    ).toBe("external:athletics:123");
  });

  it("does not merge different GoRhody games that share calendar.aspx", () => {
    expect(
      eventsLikelyDuplicate(
        {
          source: "athletics",
          externalId: "vcal_11750-gorhody.com",
          title: "University of Rhode Island Football at Stony Brook",
          startsAt: "2026-09-19T18:30:00.000Z",
          opponent: "Stony Brook",
          sport: "Football",
          eventUrl: "https://gorhody.com/calendar.aspx?game_id=11750&sport_id=2",
        },
        {
          source: "athletics",
          externalId: "vcal_11940-gorhody.com",
          title: "University of Rhode Island Women's Volleyball vs Coppin State",
          startsAt: "2026-09-19T18:30:00.000Z",
          opponent: "Coppin State",
          sport: "Women's Volleyball",
          eventUrl: "https://gorhody.com/calendar.aspx?game_id=11940&sport_id=17",
        },
      ),
    ).toBe(false);
  });

  it("does not merge doubleheaders or different opponents", () => {
    const first = {
      source: "athletics",
      title: "University of Rhode Island Women's Volleyball vs Bryant",
      startsAt: "2026-09-04T23:00:00.000Z",
      opponent: "Bryant",
      sport: "Women's Volleyball",
    };
    expect(
      eventsLikelyDuplicate(first, {
        ...first,
        startsAt: "2026-09-04T16:00:00.000Z",
        title: "University of Rhode Island Women's Volleyball vs Brown",
        opponent: "Brown",
      }),
    ).toBe(false);
  });

  it("exposes a non-breaking highlight relationship helper", () => {
    const [event] = athleticsIcsToNormalized(REAL_HOME_BASKETBALL);
    expect(athleticsHighlightRelation(event!)).toMatchObject({
      kind: "athletics_event",
      eventExternalId: "vcal_12011-gorhody.com",
      sport: "Men's Basketball",
      opponent: "Holy Cross",
      mapEligible: true,
    });
  });

  it("reads vs/at from GoRhody titles", () => {
    expect(parseAthleticsTitle("University of Rhode Island Football vs Elon").homeAway).toBe("home");
    expect(parseAthleticsTitle("University of Rhode Island Men's Soccer vs Merrimack - Senior Day").opponent).toBe(
      "Merrimack",
    );
  });
});

describe("athletics sync source isolation", () => {
  it("deactivates missing athletics rows only for the athletics source", () => {
    const src = readFileSync(join(process.cwd(), "lib/server/eventSources/athleticsSync.ts"), "utf8");
    expect(src).toContain('.eq("source", ATHLETICS_SOURCE)');
    expect(src).toContain("is_active: false");
    expect(src).toContain("idsMissingFromSeen");
    expect(src).toContain("eventsReceived > 0");
  });

  it("only links canonical duplicates across different providers", () => {
    const src = readFileSync(join(process.cwd(), "lib/server/eventSources/upsert.ts"), "utf8");
    expect(src).toContain('.neq("source", incoming.source)');
  });

  it("keeps the athletics cron independent and authenticated", () => {
    const cron = readFileSync(join(process.cwd(), "app/api/cron/sync-athletics/route.ts"), "utf8");
    const urinvolved = readFileSync(join(process.cwd(), "app/api/cron/sync-urinvolved/route.ts"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(cron).toContain("assertCronSecret");
    expect(cron).toContain("runAthleticsSync");
    expect(urinvolved).toContain("runUrinvolvedSync");
    expect(urinvolved).not.toContain("runAthleticsSync");
    expect(vercel).toContain("/api/cron/sync-athletics");
    expect(vercel).toContain("30 3 * * *");
  });
});
