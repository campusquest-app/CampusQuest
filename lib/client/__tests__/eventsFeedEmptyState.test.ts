import { describe, expect, it } from "vitest";
import { eventsEmptyStateCopy } from "@/lib/client/eventsFeedEmptyState";
import { shouldServeStaleInactiveEvents } from "@/lib/server/urinvolved/syncSafety";
import {
  fetchUrinvolvedEventsRss,
  URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE,
} from "@/lib/server/urinvolved/fetchSources";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("events empty-state copy", () => {
  it("never mentions Admin Sync Status for students", () => {
    const copy = eventsEmptyStateCopy({ hasLoadedEvents: false, isAdmin: false });
    expect(copy.title).toBe("No upcoming events right now.");
    expect(copy.detail.toLowerCase()).not.toContain("admin");
    expect(copy.detail.toLowerCase()).not.toContain("sync status");
  });

  it("keeps a normal empty state when filters removed all matching events", () => {
    const copy = eventsEmptyStateCopy({ hasLoadedEvents: true, isAdmin: false });
    expect(copy.title).toBe("No events match your filters.");
  });

  it("lets admins keep a diagnostics hint", () => {
    const copy = eventsEmptyStateCopy({ hasLoadedEvents: false, isAdmin: true });
    expect(copy.detail.toLowerCase()).toContain("admin");
  });

  it("never uses the old student empty copy that mentioned admin sync status", () => {
    const student = eventsEmptyStateCopy({ hasLoadedEvents: false, isAdmin: false });
    const combined = `${student.title} ${student.detail}`.toLowerCase();
    expect(combined).not.toContain("could not load synced");
    expect(combined).not.toContain("admin sync status");
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

  it("only renders Admin sync status when showAdminSyncLink is true", () => {
    expect(feedSrc).toContain("showAdminSyncLink = false");
    expect(feedSrc).toMatch(/\{showAdminSyncLink \? \([\s\S]*Admin sync status/);
  });

  it("does not clear already-loaded URInvolved events on a failed refresh", () => {
    expect(feedSrc).not.toMatch(/setExternalEvents\(\[\]\)/);
    expect(feedSrc).toContain("EVENTS_STALE_NOTICE");
  });

  it("does not mention admin sync status in student-facing empty copy", () => {
    expect(feedSrc.toLowerCase()).not.toContain("could not load synced");
    expect(feedSrc.toLowerCase()).not.toContain("check the admin sync status");
  });
});
