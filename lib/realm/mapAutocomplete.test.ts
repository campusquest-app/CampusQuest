import { describe, expect, it } from "vitest";
import {
  buildMapSearchCatalog,
  scoreMapSearchMatch,
  searchMapCatalog,
} from "@/lib/realm/mapAutocomplete";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";

describe("scoreMapSearchMatch", () => {
  it("prefers exact and prefix matches", () => {
    expect(scoreMapSearchMatch("library", "Library")).toBeGreaterThan(
      scoreMapSearchMatch("library", "Science Library Annex"),
    );
    expect(scoreMapSearchMatch("mem", "Memorial Union")).toBeGreaterThan(
      scoreMapSearchMatch("mem", "Campus Memory Wall"),
    );
  });

  it("matches partial words case-insensitively", () => {
    expect(scoreMapSearchMatch("quad", "The Quad")).toBeGreaterThan(0);
    expect(scoreMapSearchMatch("UNI", "Memorial Union")).toBeGreaterThan(0);
  });
});

describe("searchMapCatalog", () => {
  const now = new Date("2026-07-17T15:00:00.000Z");

  const groups: GroupedMapLocation[] = [
    {
      groupKey: "library",
      locationKey: "library",
      realmLocationId: "library",
      locationName: "Library",
      locationAddress: "15 Lippitt Rd",
      x: 50,
      y: 50,
      lat: 41.486,
      lng: -71.53,
      attachToLandmark: true,
      qrCodes: [],
      quests: [
        {
          id: "q1",
          name: "Library Check-In",
          description: "",
          xpReward: 25,
          difficulty: null,
          completionMethod: null,
          requiresQr: true,
          expiresAt: "2026-08-01T00:00:00.000Z",
          icon: "quest",
        },
      ],
      events: [
        {
          id: "e1",
          title: "Study Slam",
          startsAt: "2026-07-17T18:00:00.000Z",
          endsAt: "2026-07-17T20:00:00.000Z",
          organizationName: "Student Senate",
          eventUrl: null,
        },
      ],
    },
  ];

  it("returns typed results without duplicates and respects limit", () => {
    const catalog = buildMapSearchCatalog({
      buildings: [{ id: "library", name: "Library", shortLabel: "Lib", lat: 41.486, lng: -71.53 }],
      groups,
      clubs: [{ id: "senate", name: "Student Senate", category: "Government", source: "internal" }],
      now,
    });

    const results = searchMapCatalog(catalog, "stud", 8);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    const keys = new Set(results.map((r) => r.dedupeKey));
    expect(keys.size).toBe(results.length);
  });

  it("excludes expired quests and past events outside retention", () => {
    const catalog = buildMapSearchCatalog({
      buildings: [],
      groups: [
        {
          ...groups[0],
          quests: [
            {
              id: "old",
              name: "Old Quest",
              description: "",
              xpReward: 10,
              difficulty: null,
              completionMethod: null,
              requiresQr: false,
              expiresAt: "2026-01-01T00:00:00.000Z",
              icon: "quest",
            },
          ],
          events: [
            {
              id: "past",
              title: "Past Mixer",
              startsAt: "2026-01-01T12:00:00.000Z",
              endsAt: "2026-01-01T14:00:00.000Z",
              organizationName: null,
              eventUrl: null,
            },
          ],
        },
      ],
      now,
    });

    expect(searchMapCatalog(catalog, "old")).toHaveLength(0);
    expect(searchMapCatalog(catalog, "past")).toHaveLength(0);
  });
});
