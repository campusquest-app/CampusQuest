import { describe, expect, it } from "vitest";
import { eventsEmptyStateCopy } from "@/lib/client/eventsFeedEmptyState";
import { shouldMergeLastKnownGoodForSource, shouldServeStaleInactiveEvents } from "@/lib/server/urinvolved/syncSafety";
import {
  fetchUrinvolvedEventsRss,
  URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE,
} from "@/lib/server/urinvolved/fetchSources";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("events empty-state copy", () => {
  it("never mentions admin tools, including for admin viewers", () => {
    for (const isAdmin of [false, true]) {
      const copy = eventsEmptyStateCopy({ hasLoadedEvents: false, isAdmin });
      const combined = `${copy.title} ${copy.detail}`.toLowerCase();
      expect(copy.title).toBe("No upcoming events right now");
      expect(combined).not.toContain("admin");
      expect(combined).not.toContain("sync status");
      expect(combined).not.toContain("could not load synced");
    }
  });

  it("uses a plain empty line when nothing is filtered", () => {
    const copy = eventsEmptyStateCopy({ hasLoadedEvents: true, timeframe: "for_you" });
    expect(copy.title).toBe("No upcoming events right now");
    expect(copy.action).toBeUndefined();
  });

  it("adapts to a single filter and stays generic when several are active", () => {
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, timeframe: "today" })).toMatchObject({
      title: "Nothing scheduled for today",
      action: "clear_filters",
    });
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, timeframe: "this_weekend" })).toMatchObject({
      title: "Nothing scheduled this weekend",
      action: "clear_filters",
    });
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, category: "Athletics", timeframe: "for_you" })).toMatchObject({
      title: "No Athletics events",
      action: "clear_filters",
    });
    expect(
      eventsEmptyStateCopy({ hasLoadedEvents: true, category: "Athletics", timeframe: "today" }),
    ).toMatchObject({
      title: "No events match these filters",
      action: "clear_filters",
    });
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, hasSearch: true, timeframe: "today" })).toMatchObject({
      title: "No events match these filters",
      action: "clear_filters",
    });
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, hasSearch: true })).toMatchObject({
      title: "No events match your search",
      action: "clear_filters",
    });
  });
});

describe("stale cached events after sync failure", () => {
  it("serves stored inventory when the latest sync imported nothing and nothing is active", () => {
    expect(
      shouldServeStaleInactiveEvents({
        upcomingActiveEventsCount: 0,
        lastError: null,
        lastSyncImportedCount: 0,
      }),
    ).toBe(true);
  });

  it("serves stored inventory when the latest sync failed", () => {
    expect(
      shouldServeStaleInactiveEvents({
        upcomingActiveEventsCount: 0,
        lastError: "empty catalog",
        lastSyncImportedCount: 0,
      }),
    ).toBe(true);
  });

  it("does not use stale rows while upcoming active events exist", () => {
    expect(
      shouldServeStaleInactiveEvents({
        upcomingActiveEventsCount: 12,
        lastError: "timeout",
        lastSyncImportedCount: 0,
      }),
    ).toBe(false);
  });

  it("merges last-known-good for a degraded source even when another source is healthy", () => {
    expect(
      shouldMergeLastKnownGoodForSource({
        sourceUpcomingActiveCount: 0,
        sourceHasInactiveUpcoming: true,
        providerDegraded: true,
      }),
    ).toBe(true);
  });
});

describe("legacy RSS cannot become authoritative", () => {
  it("uses discovery_search as the only authoritative source", () => {
    expect(URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE).toBe("discovery_search");
  });

  it("throws if RSS fetch is invoked", async () => {
    await expect(fetchUrinvolvedEventsRss()).rejects.toThrow(/not an authoritative event source/i);
  });

  it("does not call RSS from the sync orchestrator", () => {
    const src = readFileSync(join(process.cwd(), "lib/server/urinvolved/sync.ts"), "utf8");
    expect(src).toContain("fetchUpcomingUrinvolvedDiscoveryEvents");
    expect(src).not.toContain("fetchUrinvolvedEventsRss");
    expect(src).not.toContain("events.rss");
  });
});

describe("EventsFeed student vs admin controls", () => {
  const feedSrc = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");

  it("defaults Event Discovery to For You without hiding unmatched events", () => {
    expect(feedSrc).toContain('timeframe: "for_you"');
    expect(feedSrc).toContain('{ value: "for_you", label: "For You" }');
    expect(feedSrc).toContain('{ value: "today", label: "Today" }');
    expect(feedSrc).toContain('{ value: "this_weekend", label: "This Weekend" }');
    expect(feedSrc).toContain('{ value: "all", label: "All" }');
    expect(feedSrc).toContain("rankRecommendationEntities");
    expect(feedSrc).toContain("without hiding the rest of campus");
    expect(feedSrc).toContain("HappeningSoonCarousel");
    expect(feedSrc).toContain("EventsCategoryRail");
    expect(feedSrc).toContain('syncBanner?.kind === "warning"');
  });

  it("keeps Admin sync status out of the zero-results state and behind the admin flag", () => {
    expect(feedSrc).toContain("showAdminSyncLink = false");
    const zeroStart = feedSrc.indexOf('className="cq-events-zero"');
    const zeroEnd = feedSrc.indexOf("HappeningSoonCarousel", zeroStart);
    const zeroBlock = feedSrc.slice(zeroStart, zeroEnd);
    expect(zeroBlock).toContain("Clear filters");
    expect(zeroBlock).not.toContain("Admin sync status");
    expect(zeroBlock).not.toContain("showAdminSyncLink");
    expect(feedSrc).toMatch(/\{showAdminSyncLink \? \([\s\S]*Admin sync status/);
  });

  it("does not clear already-loaded URInvolved events on a failed refresh", () => {
    expect(feedSrc).not.toMatch(/setExternalEvents\(\[\]\)/);
    expect(feedSrc).toContain("EVENTS_STALE_NOTICE");
    expect(feedSrc).toContain("eventsSyncBanner");
  });

  it("does not mention admin sync status in student-facing empty copy", () => {
    expect(feedSrc.toLowerCase()).not.toContain("could not load synced");
    expect(feedSrc.toLowerCase()).not.toContain("check the admin sync status");
  });
});
