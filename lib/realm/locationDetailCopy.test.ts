import { describe, expect, it } from "vitest";
import {
  buildLocationMetaPills,
  resolveLocationDetailDescription,
} from "@/lib/realm/locationDetailCopy";
import type { RealmLocation } from "@/lib/realm/locations";
import { pickFeaturedEvent } from "@/components/realm/locationDetail/LocationUpcomingHighlight";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import { formatCampusEventWhen } from "@/lib/realm/formatCampusEventWhen";

function loc(partial: Partial<RealmLocation> & Pick<RealmLocation, "id" | "name">): RealmLocation {
  return {
    fantasyName: partial.name,
    flavorText: "",
    markerEmoji: "📍",
    shortLabel: partial.name,
    major: true,
    x: 50,
    y: 50,
    activeQuests: 0,
    upcomingEvents: 0,
    studentPhotos: 0,
    quests: [],
    eventTimer: { status: "countdown", minutesUntilStart: 999, label: "None" },
    moments: [],
    ...partial,
  };
}

function event(partial: Partial<MapEventPin> & Pick<MapEventPin, "id" | "title" | "startsAt">): MapEventPin {
  return {
    endsAt: null,
    organizationName: null,
    eventUrl: null,
    ...partial,
  };
}

describe("location detail copy", () => {
  it("prefers stored description over natural fallback", () => {
    expect(
      resolveLocationDetailDescription({
        location: loc({ id: "memorial-union", name: "Memorial Union", description: "Custom blurb." }),
        displayName: "Memorial Union",
      }),
    ).toBe("Custom blurb.");
  });

  it("uses natural fallbacks for known landmarks", () => {
    expect(
      resolveLocationDetailDescription({
        location: loc({ id: "memorial-union", name: "Memorial Union" }),
        displayName: "Memorial Union",
      }),
    ).toContain("heart of campus");
  });

  it("builds relevant meta pills without inventing presence", () => {
    const pills = buildLocationMetaPills({
      location: loc({ id: "memorial-union", name: "Memorial Union", major: true }),
      eventCount: 2,
      memoryCount: 0,
    });
    expect(pills.map((p) => p.label)).toEqual(["Central Hub", "Food & Dining", "Events"]);
  });
});

describe("featured upcoming event", () => {
  it("prefers live events over later upcoming ones", () => {
    const now = new Date("2026-08-17T16:00:00.000Z");
    const live = event({
      id: "live",
      title: "Live Now",
      startsAt: "2026-08-17T15:30:00.000Z",
      endsAt: "2026-08-17T17:00:00.000Z",
    });
    const later = event({
      id: "later",
      title: "Later",
      startsAt: "2026-08-18T16:00:00.000Z",
    });
    expect(pickFeaturedEvent([later, live], now)?.id).toBe("live");
  });

  it("returns null when there are no usable events", () => {
    expect(pickFeaturedEvent([], new Date())).toBeNull();
  });
});

describe("formatCampusEventWhen", () => {
  it("labels campus-local today and tomorrow", () => {
    const now = new Date("2026-08-17T16:00:00.000Z");
    expect(formatCampusEventWhen("2026-08-17T18:00:00.000Z", now)).toMatch(/^Today •/);
    expect(formatCampusEventWhen("2026-08-18T18:00:00.000Z", now)).toMatch(/^Tomorrow •/);
  });
});
