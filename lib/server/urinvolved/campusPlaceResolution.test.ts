import { describe, expect, it } from "vitest";
import {
  canonicalVenueCoordinates,
  resolveUriCanonicalVenue,
} from "@/lib/locations/uriVenueAliases";
import { resolveExternalEventPlacement } from "@/lib/server/externalEventMapOverrides";
import type { ExternalEventMapOverrideRow } from "@/lib/server/externalEventMapOverrides";
import { matchEventLocationWithMeta } from "@/lib/server/urinvolved/mapEventLocationMatch";
import {
  CANONICAL_SOURCE_COORD_MAX_DELTA_METERS,
  chooseResolvedCoordinates,
  haversineMeters,
  sourceCoordinatesConflictWithCanonical,
} from "@/lib/server/urinvolved/coordinateSanity";

const CATALOG = [
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
  { slug: "the-quad", name: "The Quad" },
  { slug: "rec-center", name: "Rec Center" },
  { slug: "butterfield-dining", name: "Butterfield Dining Hall" },
  { slug: "mainfare-dining", name: "Mainfare Dining Hall" },
];

const KEANEY = { latitude: 41.4853, longitude: -71.5319 };
const BROWNING_AREA = { latitude: 41.4862, longitude: -71.5284 };
const MACKAL = { latitude: 41.4856, longitude: -71.5291 };
const RYAN = { latitude: 41.4865, longitude: -71.5298 };
const FASCITELLI = { latitude: 41.48515, longitude: -71.52855 };

const KEANEY_ALIASES = ["Keeney Gym", "Keeney Gymnasium", "Keaney Gym", "Keaney Gymnasium"];

function override(partial: Partial<ExternalEventMapOverrideRow>): ExternalEventMapOverrideRow {
  return {
    id: "ovr-1",
    externalEventId: "evt-1",
    source: "urinvolved",
    occurrenceStart: null,
    realmLocationId: null,
    customLat: null,
    customLng: null,
    customLabel: null,
    matchStatus: "resolved",
    matchConfidence: 0.95,
    matchReason: "source_coordinates",
    rawLocationText: "Keeney Gymnasium",
    normalizedLocationText: "keaney gym",
    googlePlaceId: null,
    formattedAddress: null,
    resolutionDebug: null,
    manuallyVerified: false,
    updatedBy: null,
    createdAt: "2026-10-16T12:00:00.000Z",
    updatedAt: "2026-10-16T12:00:00.000Z",
    ...partial,
  };
}

describe("canonical campus place matching", () => {
  it.each(KEANEY_ALIASES)("resolves %s to Keaney Gymnasium", (label) => {
    const hit = resolveUriCanonicalVenue(label);
    expect(hit?.venue.id).toBe("keaney-gymnasium");
    expect(canonicalVenueCoordinates(hit!.venue)).toEqual(KEANEY);
    const match = matchEventLocationWithMeta({ locationName: label }, CATALOG);
    expect(match?.match.kind).toBe("coords");
    if (match?.match.kind === "coords") {
      expect(match.match.latitude).toBeCloseTo(KEANEY.latitude, 4);
      expect(match.match.longitude).toBeCloseTo(KEANEY.longitude, 4);
    }
    expect(match?.meta.matchReason === "canonical_exact" || match?.meta.matchReason === "canonical_alias").toBe(
      true,
    );
  });

  it("resolves Mackal, Ryan, dining halls, and Fascitelli to distinct places", () => {
    const cases = [
      { text: "Mackal Field House", id: "mackal-field-house", coords: MACKAL },
      { text: "Mackal Fieldhouse", id: "mackal-field-house", coords: MACKAL },
      { text: "Ryan Center", id: "ryan-center", coords: RYAN },
      { text: "The Ryan Center", id: "ryan-center", coords: RYAN },
      { text: "Fascitelli Fitness & Wellness Center", id: "fascitelli-fitness", coords: FASCITELLI },
      { text: "Anna Fascitelli Fitness and Wellness Center", id: "fascitelli-fitness", coords: FASCITELLI },
    ] as const;

    for (const row of cases) {
      const hit = resolveUriCanonicalVenue(row.text);
      expect(hit?.venue.id, row.text).toBe(row.id);
      expect(canonicalVenueCoordinates(hit!.venue)).toEqual(row.coords);
    }

    expect(resolveUriCanonicalVenue("Mainfare Dining Hall")?.venue.realmLocationId).toBe("mainfare-dining");
    expect(resolveUriCanonicalVenue("Butterfield Dining Hall")?.venue.realmLocationId).toBe(
      "butterfield-dining",
    );
    expect(resolveUriCanonicalVenue("Mackal Field House")?.venue.realmLocationId).toBeNull();
    expect(resolveUriCanonicalVenue("Rec Center")?.venue.id).toBe("rec-center");
    expect(resolveUriCanonicalVenue("URI Keaney Gym: 85 Keaney Road, Kingston RI 02881")?.venue.id).toBe(
      "keaney-gymnasium",
    );
  });

  it("does not collapse Mackal or Fascitelli onto the Rec Center", () => {
    expect(resolveUriCanonicalVenue("Mackal Field House")?.venue.id).not.toBe("rec-center");
    expect(resolveUriCanonicalVenue("Fascitelli Fitness")?.venue.id).not.toBe("rec-center");
  });
});

describe("canonical coordinates override bad imported points", () => {
  it("uses Keaney coords when the imported point sits near Browning / Butterfield", () => {
    const chosen = chooseResolvedCoordinates({
      canonical: KEANEY,
      source: BROWNING_AREA,
      canonicalMatchMethod: "alias",
    });
    expect(chosen?.source).toBe("canonical_alias");
    expect(chosen?.latitude).toBe(KEANEY.latitude);
    expect(chosen?.longitude).toBe(KEANEY.longitude);
    expect(chosen?.mismatchMeters).toBeGreaterThan(CANONICAL_SOURCE_COORD_MAX_DELTA_METERS);
    expect(
      sourceCoordinatesConflictWithCanonical({ source: BROWNING_AREA, canonical: KEANEY }),
    ).toBe(true);
  });

  it("keeps source coordinates only when no canonical place exists", () => {
    const chosen = chooseResolvedCoordinates({
      canonical: null,
      source: BROWNING_AREA,
    });
    expect(chosen).toEqual({
      latitude: BROWNING_AREA.latitude,
      longitude: BROWNING_AREA.longitude,
      source: "source_coordinates",
      mismatchMeters: null,
    });
  });

  it("does not treat nearby source coords as a conflict", () => {
    const nearby = { latitude: KEANEY.latitude + 0.00005, longitude: KEANEY.longitude };
    expect(haversineMeters(KEANEY, nearby)).toBeLessThan(CANONICAL_SOURCE_COORD_MAX_DELTA_METERS);
    expect(sourceCoordinatesConflictWithCanonical({ source: nearby, canonical: KEANEY })).toBe(false);
    const chosen = chooseResolvedCoordinates({
      canonical: KEANEY,
      source: nearby,
      canonicalMatchMethod: "exact",
    });
    expect(chosen?.source).toBe("canonical_exact");
    expect(chosen?.latitude).toBe(KEANEY.latitude);
  });

  it("overrides a stale stored override that placed Keeney at Browning", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { locationName: "Keeney Gymnasium" },
      catalog: CATALOG,
      override: override({
        customLat: BROWNING_AREA.latitude,
        customLng: BROWNING_AREA.longitude,
        customLabel: "Keeney Gymnasium",
        matchStatus: "resolved",
        matchReason: "source_coordinates",
      }),
    });
    expect(resolved.match?.kind).toBe("coords");
    if (resolved.match?.kind === "coords") {
      expect(resolved.match.latitude).toBeCloseTo(KEANEY.latitude, 4);
      expect(resolved.match.longitude).toBeCloseTo(KEANEY.longitude, 4);
      expect(resolved.match.locationName).toBe("Keaney Gym");
    }
    expect(resolved.appliedOverride).toBe(false);
    expect(resolved.meta?.matchReason === "canonical_exact" || resolved.meta?.matchReason === "canonical_alias").toBe(
      true,
    );
  });

  it("unknown locations fall back instead of guessing a building", () => {
    expect(resolveUriCanonicalVenue("Brambleweft Pavilion")).toBeNull();
    const resolved = resolveExternalEventPlacement({
      fields: { locationName: "Brambleweft Pavilion" },
      catalog: CATALOG,
      override: override({
        rawLocationText: "Brambleweft Pavilion",
        normalizedLocationText: "brambleweft pavilion",
        customLat: null,
        customLng: null,
        matchStatus: "unresolved",
        matchReason: "unmatched",
      }),
    });
    expect(resolved.match).toBeNull();
    expect(resolved.renderOnMap).toBe(false);
  });
});

describe("admin override wins over canonical and source", () => {
  it("keeps a manual drag even when the location text is Keeney Gym", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { locationName: "Keeney Gymnasium" },
      catalog: CATALOG,
      override: override({
        customLat: 41.4831,
        customLng: -71.5342,
        customLabel: "Custom location",
        matchStatus: "manually_adjusted",
        matchReason: "manual_drag",
        manuallyVerified: false,
      }),
    });
    expect(resolved.appliedOverride).toBe(true);
    expect(resolved.match?.kind).toBe("coords");
    if (resolved.match?.kind === "coords") {
      expect(resolved.match.latitude).toBeCloseTo(41.4831, 4);
      expect(resolved.match.longitude).toBeCloseTo(-71.5342, 4);
    }
  });
});
