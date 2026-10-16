import { describe, expect, it } from "vitest";
import {
  canonicalVenueCoordinates,
  resolveUriCanonicalVenue,
} from "@/lib/locations/uriVenueAliases";
import { matchEventLocationWithMeta } from "@/lib/server/urinvolved/mapEventLocationMatch";
import { haversineMeters } from "@/lib/server/urinvolved/coordinateSanity";

const CATALOG = [
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
  { slug: "the-quad", name: "The Quad" },
  { slug: "rec-center", name: "Rec Center" },
  { slug: "butterfield-dining", name: "Butterfield Dining Hall" },
  { slug: "mainfare-dining", name: "Mainfare Dining Hall" },
];

/** Representative imported points that previously landed on the wrong building. */
const AUDIT_ROWS = [
  {
    event: "Intramural / Keeney Gym event",
    sourceLocationText: "Keeney Gymnasium",
    currentCoords: { latitude: 41.4862, longitude: -71.5284 },
  },
  {
    event: "Keeney Gym short label",
    sourceLocationText: "Keeney Gym",
    currentCoords: { latitude: 41.4862, longitude: -71.5284 },
  },
  {
    event: "Athletics at Keaney",
    sourceLocationText: "Kingston, R.I., Keaney Gymnasium",
    currentCoords: { latitude: 41.4862, longitude: -71.5284 },
  },
  {
    event: "Mackal Field House event",
    sourceLocationText: "Mackal Field House",
    currentCoords: { latitude: 41.4849, longitude: -71.5288 },
  },
  {
    event: "Fascitelli Fitness event",
    sourceLocationText: "Anna Fascitelli Fitness and Wellness Center",
    currentCoords: { latitude: 41.4849, longitude: -71.5288 },
  },
] as const;

describe("event location mismatch audit", () => {
  it("re-resolves known wrong-building imports onto their canonical places", () => {
    const report = AUDIT_ROWS.map((row) => {
      const venue = resolveUriCanonicalVenue(row.sourceLocationText);
      const canonical = venue ? canonicalVenueCoordinates(venue.venue) : null;
      const match = matchEventLocationWithMeta({ locationName: row.sourceLocationText }, CATALOG);
      const distance = canonical
        ? haversineMeters(row.currentCoords, canonical)
        : null;
      return {
        event: row.event,
        sourceLocationText: row.sourceLocationText,
        currentCoords: row.currentCoords,
        canonicalPlace: venue?.venue.name ?? null,
        distanceMismatchMeters: distance == null ? null : Math.round(distance),
        finalResolution: match?.meta.matchReason ?? "unresolved",
        finalCoords:
          match?.match.kind === "coords"
            ? { latitude: match.match.latitude, longitude: match.match.longitude }
            : match?.match.kind === "realm"
              ? { realmLocationId: match.match.realmLocationId }
              : null,
      };
    });

    for (const row of report) {
      expect(row.canonicalPlace, row.event).toBeTruthy();
      expect(row.distanceMismatchMeters, row.event).toBeGreaterThan(30);
      expect(
        row.finalResolution === "canonical_exact" || row.finalResolution === "canonical_alias",
        row.event,
      ).toBe(true);
    }

    expect(report[0]?.canonicalPlace).toBe("Keaney Gym");
    expect(report[3]?.canonicalPlace).toBe("Mackal Field House");
    expect(report[4]?.canonicalPlace).toBe("Fascitelli Fitness & Wellness Center");
  });
});
