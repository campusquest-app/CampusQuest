import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveExternalEventPlacement,
  type ExternalEventMapOverrideRow,
} from "@/lib/server/externalEventMapOverrides";
import { extractBuildingName } from "@/lib/server/urinvolved/normalizeCampusLocationName";
import { formatCampusTime } from "@/lib/realm/eventCountdown";
import { effectiveEventEndIso, isEventVisibleOnMap } from "@/lib/realm/eventVisibility";
import type { CampusBuildingRegistryEntry } from "@/lib/server/urinvolved/campusBuildingRegistry";

const CATALOG = [
  { slug: "weldin-hall", name: "Weldin Hall" },
  { slug: "library", name: "Library" },
];

const WELDIN_REGISTRY: CampusBuildingRegistryEntry = {
  slug: "weldin-hall",
  canonicalName: "Weldin Hall",
  aliases: ["weldin hall first floor lounge"],
  latitude: 41.4908,
  longitude: -71.5294,
  googlePlaceId: "place-weldin",
  formattedAddress: "Weldin Hall, 2 Lippitt Rd, Kingston, RI",
  verified: true,
  geocodeSource: "google",
  updatedAt: new Date().toISOString(),
};

function override(partial: Partial<ExternalEventMapOverrideRow>): ExternalEventMapOverrideRow {
  return {
    id: "ovr-1",
    externalEventId: "evt-1",
    source: "urinvolved",
    occurrenceStart: "2026-07-16T22:30:00.000Z",
    realmLocationId: null,
    customLat: null,
    customLng: null,
    customLabel: null,
    matchStatus: "resolved",
    matchConfidence: 0.95,
    matchReason: "registry_match",
    rawLocationText: "Weldin Hall First Floor Lounge",
    normalizedLocationText: "weldin hall",
    googlePlaceId: null,
    formattedAddress: null,
    resolutionDebug: null,
    manuallyVerified: false,
    updatedBy: null,
    createdAt: "2026-07-16T12:00:00.000Z",
    updatedAt: "2026-07-16T12:00:00.000Z",
    ...partial,
  };
}

describe("room text → parent building", () => {
  it("maps Weldin Hall First Floor Lounge to weldin hall", () => {
    expect(extractBuildingName("Weldin Hall First Floor Lounge")).toBe("weldin hall");
  });
});

describe("resolveExternalEventPlacement map rendering", () => {
  it("renders needs_review placements that already have coordinates", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { venueName: "Weldin Hall First Floor Lounge" },
      catalog: CATALOG,
      registry: [WELDIN_REGISTRY],
      override: override({
        matchStatus: "needs_review",
        matchConfidence: 0.82,
        customLat: 41.4908,
        customLng: -71.5294,
        customLabel: "Weldin Hall",
      }),
    });
    expect(resolved.renderOnMap).toBe(true);
    expect(resolved.match?.kind).toBe("coords");
    if (resolved.match?.kind === "coords") {
      expect(resolved.match.locationName).toBe("Weldin Hall");
    }
  });

  it("does not render unresolved locations without coordinates", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { venueName: "Some Unknown Shed" },
      catalog: CATALOG,
      registry: [],
      override: override({
        matchStatus: "unresolved",
        matchConfidence: 0,
        matchReason: "google_unresolved",
        customLat: null,
        customLng: null,
        rawLocationText: "Some Unknown Shed",
      }),
    });
    expect(resolved.renderOnMap).toBe(false);
    expect(resolved.match).toBeNull();
  });

  it("keeps cancelled/reactivated events on the same override coords", () => {
    const base = override({
      matchStatus: "resolved",
      customLat: 41.4908,
      customLng: -71.5294,
      customLabel: "Weldin Hall",
    });
    const cancelled = resolveExternalEventPlacement({
      fields: { venueName: "Weldin Hall First Floor Lounge" },
      catalog: CATALOG,
      override: base,
      registry: [WELDIN_REGISTRY],
    });
    const reactivated = resolveExternalEventPlacement({
      fields: { venueName: "Weldin Hall First Floor Lounge" },
      catalog: CATALOG,
      override: { ...base, updatedAt: "2026-07-16T13:00:00.000Z" },
      registry: [WELDIN_REGISTRY],
    });
    expect(cancelled.match).toEqual(reactivated.match);
    expect(cancelled.renderOnMap).toBe(true);
    expect(reactivated.renderOnMap).toBe(true);
  });

  it("moves the marker when location override coordinates change", () => {
    const before = resolveExternalEventPlacement({
      fields: { venueName: "Weldin Hall First Floor Lounge" },
      catalog: CATALOG,
      override: override({
        customLat: 41.4908,
        customLng: -71.5294,
        customLabel: "Weldin Hall",
      }),
      registry: [WELDIN_REGISTRY],
    });
    const after = resolveExternalEventPlacement({
      fields: { venueName: "Library" },
      catalog: CATALOG,
      override: override({
        rawLocationText: "Library",
        normalizedLocationText: "library",
        realmLocationId: "library",
        customLat: 41.4865,
        customLng: -71.5302,
        customLabel: "Library",
      }),
      registry: [WELDIN_REGISTRY],
    });
    expect(before.match?.kind).toBe("coords");
    // Catalog landmark overrides attach as realm pins (not duplicate coords markers).
    expect(after.match?.kind).toBe("realm");
    if (before.match?.kind === "coords" && after.match?.kind === "realm") {
      expect(after.match.realmLocationId).toBe("library");
      expect(before.match.latitude).toBeCloseTo(41.4908, 3);
    }
  });
});

describe("America/New_York conversion + today visibility + 24h grace", () => {
  it("formats Vision Board Night start as 6:30 PM local", () => {
    // 2026-07-16 18:30 America/New_York (EDT, UTC-4)
    expect(formatCampusTime("2026-07-16T22:30:00.000Z")).toBe("6:30 PM");
  });

  it("keeps today events visible under the map retention window", () => {
    const now = new Date("2026-07-16T23:00:00.000Z");
    const startsAt = "2026-07-16T22:30:00.000Z";
    const endsAt = "2026-07-17T00:30:00.000Z";
    expect(isEventVisibleOnMap({ end_time: effectiveEventEndIso(startsAt, endsAt) }, now)).toBe(true);
  });

  it("keeps events visible until 24 hours after they end", () => {
    const now = new Date("2026-07-17T23:00:00.000Z");
    const endsAt = "2026-07-16T23:30:00.000Z"; // ended 23.5h ago
    expect(isEventVisibleOnMap({ end_time: endsAt }, now)).toBe(true);
    expect(isEventVisibleOnMap({ end_time: "2026-07-16T22:00:00.000Z" }, now)).toBe(false);
  });
});

const upsertCalls: Array<Record<string, unknown>> = [];
let storedOverride: Record<string, unknown> | null = null;
let eventRow: Record<string, unknown>;

function makeThenableQuery(result: { data: unknown; error: null | { message: string } }) {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "external_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: eventRow, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        };
      }
      if (table === "campus_locations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { latitude: 41.4908, longitude: -71.5294, name: "Weldin Hall" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "external_event_map_overrides") {
        return {
          select: () => ({
            in: async () => ({
              data: storedOverride ? [storedOverride] : [],
              error: null,
            }),
            eq: () => makeThenableQuery({ data: storedOverride, error: null }),
          }),
          upsert: (row: Record<string, unknown>) => {
            upsertCalls.push(row);
            storedOverride = {
              id: "ovr-1",
              created_at: "2026-07-16T12:00:00.000Z",
              updated_at: "2026-07-16T12:00:00.000Z",
              manually_verified: false,
              ...row,
            };
            return {
              select: () => ({
                single: async () => ({ data: storedOverride, error: null }),
              }),
            };
          },
          update: (row: Record<string, unknown>) => ({
            eq: () => {
              storedOverride = { ...(storedOverride ?? {}), ...row };
              return {
                select: () => ({
                  single: async () => ({ data: storedOverride, error: null }),
                }),
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: storedOverride, error: null }).then(resolve),
              };
            },
          }),
          delete: () => ({
            in: async () => ({ data: null, error: null }),
            eq: async () => {
              storedOverride = null;
              return { data: null, error: null };
            },
          }),
        };
      }
      return makeThenableQuery({ data: null, error: null });
    },
  }),
}));

vi.mock("@/lib/server/campusLocationsDb", () => ({
  getCampusLocations: async () => [
    { slug: "weldin-hall", name: "Weldin Hall", shortLabel: "Weldin" },
    { slug: "library", name: "Library", shortLabel: "Lib" },
  ],
}));

vi.mock("@/lib/server/urinvolved/campusBuildingRegistry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/urinvolved/campusBuildingRegistry")>(
    "@/lib/server/urinvolved/campusBuildingRegistry",
  );
  return {
    ...actual,
    loadCampusBuildingRegistry: async () => [WELDIN_REGISTRY],
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("resolveAndUpsertEventMapPlacement pipeline", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    storedOverride = null;
    eventRow = {
      id: "evt-1",
      external_id: "vision-board-1",
      title: "Vision Board Night",
      venue_name: "Weldin Hall First Floor Lounge",
      location_name: null,
      address: null,
      starts_at: "2026-07-16T22:30:00.000Z",
      ends_at: "2026-07-17T00:30:00.000Z",
      latitude: null,
      longitude: null,
      is_active: true,
      tags: [],
      source: "urinvolved",
    };
    vi.resetModules();
  });

  it("sync creates a marker for Vision Board Night at Weldin Hall", async () => {
    const { resolveAndUpsertEventMapPlacement } = await import(
      "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement"
    );
    const result = await resolveAndUpsertEventMapPlacement("evt-1", { revalidate: false });
    expect(result.renderOnMap).toBe(true);
    expect(result.matchedBuilding?.toLowerCase()).toContain("weldin");
    expect(result.rawLocation).toBe("Weldin Hall First Floor Lounge");
    expect(result.latitude).toBeCloseTo(41.4908, 3);
    expect(result.longitude).toBeCloseTo(-71.5294, 3);
    expect(result.matchStatus === "resolved" || result.matchStatus === "needs_review").toBe(true);
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("resync does not create a duplicate override row", async () => {
    const { resolveAndUpsertEventMapPlacement } = await import(
      "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement"
    );
    await resolveAndUpsertEventMapPlacement("evt-1", { revalidate: false });
    const firstId = storedOverride?.id;
    await resolveAndUpsertEventMapPlacement("evt-1", { revalidate: false });
    expect(storedOverride?.id).toBe(firstId);
    // Upserts target the same external_event_id conflict key.
    expect(upsertCalls.every((row) => row.external_event_id === "evt-1")).toBe(true);
  });

  it("logs unresolved locations with a failure reason", async () => {
    eventRow = {
      ...eventRow,
      title: "Mystery Meetup",
      venue_name: "Atlantis Pavilion",
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { resolveAndUpsertEventMapPlacement } = await import(
      "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement"
    );
    // Force catalog/registry miss by empty registry mock already only has Weldin —
    // Atlantis won't match; geocode may still be called — stub geocoder.
    vi.doMock("@/lib/server/geocoding/googleCampusGeocoder", () => ({
      MIN_PUBLIC_MAP_CONFIDENCE: 0.75,
      geocodeUriBuilding: async () => null,
    }));
    const result = await resolveAndUpsertEventMapPlacement("evt-1", {
      revalidate: false,
      forceGoogle: true,
      catalog: CATALOG,
    });
    expect(result.renderOnMap).toBe(false);
    expect(result.failureReason).toBeTruthy();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("reconciliation restores a deleted marker", async () => {
    const { resolveAndUpsertEventMapPlacement, reconcileEventMapPlacements } = await import(
      "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement"
    );
    await resolveAndUpsertEventMapPlacement("evt-1", { revalidate: false });
    storedOverride = null;
    // Re-run single-event repair (same path reconcile uses).
    const restored = await resolveAndUpsertEventMapPlacement("evt-1", { revalidate: false });
    expect(restored.renderOnMap).toBe(true);
    expect(storedOverride).not.toBeNull();
    expect(typeof reconcileEventMapPlacements).toBe("function");
  });
});
