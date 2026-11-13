import { describe, expect, it } from "vitest";
import { eventsFeedCacheIsFresh, eventsFeedCacheIsVisible, EVENTS_FEED_FRESH_MS, EVENTS_FEED_MAX_AGE_MS } from "@/lib/client/eventsFeedCache";

describe("events feed cache lifetime", () => {
  const now = Date.parse("2026-11-13T02:00:00Z");

  it("treats a recent snapshot as fresh enough to skip a refetch", () => {
    expect(eventsFeedCacheIsFresh(now - 5_000, now)).toBe(true);
    expect(eventsFeedCacheIsFresh(now - EVENTS_FEED_FRESH_MS, now)).toBe(false);
  });

  it("keeps an older snapshot visible only long enough to refresh behind it", () => {
    expect(eventsFeedCacheIsVisible(now - EVENTS_FEED_FRESH_MS - 1, now)).toBe(true);
    expect(eventsFeedCacheIsVisible(now - EVENTS_FEED_MAX_AGE_MS, now)).toBe(false);
  });
});
