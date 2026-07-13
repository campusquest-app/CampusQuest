import { describe, expect, it } from "vitest";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import {
  dedupeLogicalMapEvents,
  getLogicalEventKey,
  mergeMapEventPins,
  normalizeEventTitle,
} from "@/lib/realm/dedupeLogicalEvents";
import { filterVisibleMapEvents, isEventVisibleOnMap } from "@/lib/realm/eventVisibility";

function pin(overrides: Partial<MapEventPin> = {}): MapEventPin {
  return {
    id: "evt-1",
    title: "Karaoke Night",
    startsAt: "2026-07-10T23:00:00.000Z",
    endsAt: "2026-07-11T01:00:00.000Z",
    organizationName: "Talent Development",
    eventUrl: "https://urinvolved.uri.edu/event/12345",
    locationText: "weldin hall",
    source: "urinvolved",
    sourceExternalId: "12345",
    ...overrides,
  };
}

describe("dedupeLogicalEvents", () => {
  it("normalizes cancelled suffixes from titles", () => {
    expect(normalizeEventTitle("Karaoke Night (Cancelled)")).toBe("karaoke night");
    expect(normalizeEventTitle("Cancelled: Karaoke Night")).toBe("karaoke night");
  });

  it("matches titles with and without (Cancelled) via fallback key", () => {
    const active = pin({ cancelled: false, sourceExternalId: null, eventUrl: null });
    const cancelled = pin({
      id: "evt-2",
      title: "Karaoke Night (Cancelled)",
      cancelled: true,
      sourceExternalId: null,
      eventUrl: null,
    });
    expect(getLogicalEventKey(active)).toBe(getLogicalEventKey(cancelled));
  });

  it("active plus cancelled copy returns only the cancelled event", () => {
    const active = pin({ id: "active", cancelled: false, updatedAt: "2026-07-01T00:00:00.000Z" });
    const cancelled = pin({
      id: "cancelled",
      title: "Karaoke Night (Cancelled)",
      cancelled: true,
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
    const result = dedupeLogicalMapEvents([active, cancelled]);
    expect(result).toHaveLength(1);
    expect(result[0]?.cancelled).toBe(true);
    expect(result[0]?.title).toContain("Cancelled");
  });

  it("active plus updated active copy returns only the newest record", () => {
    const older = pin({ id: "older", updatedAt: "2026-07-01T00:00:00.000Z", imageUrl: null });
    const newer = pin({
      id: "newer",
      updatedAt: "2026-07-03T00:00:00.000Z",
      imageUrl: "https://cdn.example/karaoke.jpg",
    });
    const result = dedupeLogicalMapEvents([older, newer]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("newer");
    expect(result[0]?.imageUrl).toBe("https://cdn.example/karaoke.jpg");
  });

  it("keeps unrelated events with similar titles separate", () => {
    const a = pin({ id: "a", startsAt: "2026-07-10T23:00:00.000Z", sourceExternalId: "111" });
    const b = pin({ id: "b", startsAt: "2026-07-17T23:00:00.000Z", sourceExternalId: "222" });
    expect(dedupeLogicalMapEvents([a, b])).toHaveLength(2);
  });

  it("event count and marker count both equal one after dedupe", () => {
    const events = dedupeLogicalMapEvents([
      pin({ id: "1", cancelled: false }),
      pin({ id: "2", title: "Karaoke Night (Cancelled)", cancelled: true }),
    ]);
    expect(events.length).toBe(1);
  });

  it("merges missing descriptive fields from the losing record", () => {
    const merged = mergeMapEventPins(pin({ imageUrl: null }), pin({ imageUrl: "https://cdn.example/poster.png" }));
    expect(merged.imageUrl).toBe("https://cdn.example/poster.png");
  });

  it("deduplicated cancelled event disappears 24 hours after scheduled end", () => {
    const endsAt = "2026-07-11T01:00:00.000Z";
    const cancelled = dedupeLogicalMapEvents([
      pin({ cancelled: false }),
      pin({ id: "2", title: "Karaoke Night (Cancelled)", cancelled: true, endsAt }),
    ])[0]!;

    expect(filterVisibleMapEvents([cancelled], new Date("2026-07-11T23:00:00.000Z"))).toHaveLength(1);
    expect(isEventVisibleOnMap({ endsAt: cancelled.endsAt }, new Date("2026-07-12T02:00:00.000Z"))).toBe(false);
    expect(filterVisibleMapEvents([cancelled], new Date("2026-07-12T02:00:00.000Z"))).toHaveLength(0);
  });

  it("prefers URInvolved external id for logical key", () => {
    expect(getLogicalEventKey(pin({ title: "Different Title", sourceExternalId: "99999" }))).toBe(
      "external:99999",
    );
  });
});
