/**
 * Shared campus coordinate sanity checks.
 * Imported event lat/lng may be campus-valid and still sit on the wrong building.
 */

/** ~100 ft. Source coords farther than this from a confident canonical place are discarded. */
export const CANONICAL_SOURCE_COORD_MAX_DELTA_METERS = 30;

export type LatLng = { latitude: number; longitude: number };

export type CoordinateResolutionSource =
  | "manual_admin"
  | "canonical_exact"
  | "canonical_alias"
  | "source_coordinates"
  | "fallback";

export const CANONICAL_MATCH_REASONS = [
  "canonical_exact",
  "canonical_alias",
  "canonical_venue",
  "verified_registry",
] as const;

export function isCanonicalMatchReason(reason: string | null | undefined): boolean {
  return Boolean(reason && (CANONICAL_MATCH_REASONS as readonly string[]).includes(reason));
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sourceCoordinatesConflictWithCanonical(args: {
  source: LatLng | null | undefined;
  canonical: LatLng;
  maxDeltaMeters?: number;
}): boolean {
  if (!args.source) return false;
  const delta = haversineMeters(args.source, args.canonical);
  return delta > (args.maxDeltaMeters ?? CANONICAL_SOURCE_COORD_MAX_DELTA_METERS);
}

export function chooseResolvedCoordinates(args: {
  canonical: LatLng | null | undefined;
  source: LatLng | null | undefined;
  canonicalMatchMethod?: "exact" | "alias";
}): {
  latitude: number;
  longitude: number;
  source: Exclude<CoordinateResolutionSource, "manual_admin" | "fallback">;
  mismatchMeters: number | null;
} | null {
  if (args.canonical) {
    const mismatchMeters = args.source ? haversineMeters(args.source, args.canonical) : null;
    if (
      args.source &&
      mismatchMeters != null &&
      mismatchMeters > CANONICAL_SOURCE_COORD_MAX_DELTA_METERS
    ) {
      console.warn("[cq:event-location] source coordinates disagree with canonical place", {
        canonical: args.canonical,
        source: args.source,
        mismatchMeters: Math.round(mismatchMeters),
        thresholdMeters: CANONICAL_SOURCE_COORD_MAX_DELTA_METERS,
      });
    }
    return {
      latitude: args.canonical.latitude,
      longitude: args.canonical.longitude,
      source: args.canonicalMatchMethod === "exact" ? "canonical_exact" : "canonical_alias",
      mismatchMeters,
    };
  }
  if (args.source) {
    return {
      latitude: args.source.latitude,
      longitude: args.source.longitude,
      source: "source_coordinates",
      mismatchMeters: null,
    };
  }
  return null;
}
