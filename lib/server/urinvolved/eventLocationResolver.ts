import type { CatalogLocationLike, EventLocationMatch } from "@/lib/server/urinvolved/mapEventLocationTypes";
import {
  geocodeUriBuilding,
  MIN_PUBLIC_MAP_CONFIDENCE,
  type GoogleGeocodeResult,
} from "@/lib/server/geocoding/googleCampusGeocoder";
import {
  loadCampusBuildingRegistry,
  matchCanonicalSafeRegistryEntry,
  upsertBuildingFromGeocode,
  type CampusBuildingRegistryEntry,
} from "@/lib/server/urinvolved/campusBuildingRegistry";
import { resolveUriCanonicalVenueFromFields } from "@/lib/locations/uriVenueAliases";
import {
  extractBuildingName,
  normalizeCampusLocationName,
} from "@/lib/server/urinvolved/normalizeCampusLocationName";
import {
  matchCanonicalUriVenue,
  matchEventLocationWithMeta,
  type EventLocationMatchMeta,
} from "@/lib/server/urinvolved/eventLocationMatcher";

export type EventLocationResolutionDebug = {
  originalLocationText: string;
  normalizedBuildingName: string;
  selectedGoogleResult: GoogleGeocodeResult | null;
  registryMatch: CampusBuildingRegistryEntry | null;
  confidence: number;
  matchReason: string;
  manuallyOverridden: boolean;
  renderOnMap: boolean;
};

export type EventLocationResolutionResult = {
  match: EventLocationMatch | null;
  meta: EventLocationMatchMeta | null;
  debug: EventLocationResolutionDebug;
  registrySlug: string | null;
  googlePlaceId: string | null;
  formattedAddress: string | null;
};

function rawLocationFromFields(fields: {
  venueName?: string | null;
  locationName?: string | null;
  address?: string | null;
}): string {
  return (
    fields.venueName?.trim() ||
    fields.locationName?.trim() ||
    fields.address?.trim() ||
    ""
  );
}

/**
 * Registry hits always attach to the canonical campus_locations slug as a
 * realm landmark. Never emit a separate coords pin for a known building —
 * that duplicates the blue landmark with a purple event pin.
 */
function registryMatch(
  building: string,
  entry: CampusBuildingRegistryEntry,
  sourceText: string,
  reason: string,
  confidence: number,
  catalog?: CatalogLocationLike[],
): EventLocationResolutionResult {
  const inCatalog =
    !catalog ||
    catalog.length === 0 ||
    catalog.some((c) => c.slug === entry.slug || normalizeCampusLocationName(c.name) === normalizeCampusLocationName(entry.canonicalName));

  const match: EventLocationMatch = inCatalog
    ? {
        kind: "realm",
        realmLocationId: entry.slug,
        locationName: entry.canonicalName,
        matchedText: sourceText,
      }
    : {
        kind: "coords",
        locationName: entry.canonicalName,
        latitude: entry.latitude,
        longitude: entry.longitude,
        matchedText: sourceText,
      };

  const meta: EventLocationMatchMeta = {
    rawLocation: sourceText,
    normalizedLocation: building,
    confidence,
    matchReason: reason,
    needsReview: confidence < 0.9,
    matchedText: sourceText,
  };
  return {
    match,
    meta,
    debug: {
      originalLocationText: sourceText,
      normalizedBuildingName: building,
      selectedGoogleResult: null,
      registryMatch: entry,
      confidence,
      matchReason: reason,
      manuallyOverridden: false,
      renderOnMap: confidence >= MIN_PUBLIC_MAP_CONFIDENCE,
    },
    registrySlug: entry.slug,
    googlePlaceId: entry.googlePlaceId,
    formattedAddress: entry.formattedAddress,
  };
}

/** Exact canonical-venue hit — trusted coordinates, no geocoding needed. */
function canonicalVenueResult(
  building: string,
  sourceText: string,
  candidate: { match: EventLocationMatch; confidence: number; reason: string },
): EventLocationResolutionResult {
  const meta: EventLocationMatchMeta = {
    rawLocation: sourceText,
    normalizedLocation: building,
    confidence: candidate.confidence,
    matchReason: candidate.reason,
    needsReview: false,
    matchedText: candidate.match.matchedText,
  };
  return {
    match: candidate.match,
    meta,
    debug: {
      originalLocationText: sourceText,
      normalizedBuildingName: building,
      selectedGoogleResult: null,
      registryMatch: null,
      confidence: candidate.confidence,
      matchReason: candidate.reason,
      manuallyOverridden: false,
      renderOnMap: true,
    },
    registrySlug: candidate.match.kind === "realm" ? candidate.match.realmLocationId : null,
    googlePlaceId: null,
    formattedAddress: null,
  };
}

function googleMatch(
  building: string,
  sourceText: string,
  geocode: GoogleGeocodeResult,
  registry: CampusBuildingRegistryEntry | null,
  reason: string,
): EventLocationResolutionResult {
  // Geocode that lands on a saved campus_locations row attaches to that landmark.
  if (registry?.slug) {
    return registryMatch(building, registry, sourceText, reason, geocode.confidence);
  }
  const match: EventLocationMatch = {
    kind: "coords",
    locationName: geocode.name,
    latitude: geocode.latitude,
    longitude: geocode.longitude,
    matchedText: sourceText,
  };
  const meta: EventLocationMatchMeta = {
    rawLocation: sourceText,
    normalizedLocation: building,
    confidence: geocode.confidence,
    matchReason: reason,
    needsReview: geocode.confidence < 0.9,
    matchedText: sourceText,
  };
  return {
    match,
    meta,
    debug: {
      originalLocationText: sourceText,
      normalizedBuildingName: building,
      selectedGoogleResult: geocode,
      registryMatch: registry,
      confidence: geocode.confidence,
      matchReason: reason,
      manuallyOverridden: false,
      renderOnMap: geocode.confidence >= MIN_PUBLIC_MAP_CONFIDENCE,
    },
    registrySlug: registry?.slug ?? null,
    googlePlaceId: geocode.placeId,
    formattedAddress: geocode.formattedAddress,
  };
}

/** Identifying details logged when an event cannot be placed on the map. */
export type EventLocationDiagnosticContext = {
  eventId?: string | null;
  title?: string | null;
  source?: string | null;
  venueName?: string | null;
  address?: string | null;
};

function logUnresolved(
  sourceText: string,
  building: string,
  reason: string,
  context?: EventLocationDiagnosticContext,
): void {
  console.warn("[cq:event-location] unresolved — no map marker will be shown", {
    eventId: context?.eventId ?? null,
    title: context?.title ?? null,
    source: context?.source ?? null,
    rawVenue: context?.venueName ?? null,
    rawAddress: context?.address ?? null,
    rawLocationText: sourceText,
    normalizedVenue: building,
    reason,
  });
}

function unresolved(
  sourceText: string,
  building: string,
  reason: string,
  context?: EventLocationDiagnosticContext,
): EventLocationResolutionResult {
  logUnresolved(sourceText, building, reason, context);
  return {
    match: null,
    meta: {
      rawLocation: sourceText,
      normalizedLocation: building,
      confidence: 0,
      matchReason: reason,
      needsReview: false,
      matchedText: sourceText,
    },
    debug: {
      originalLocationText: sourceText,
      normalizedBuildingName: building,
      selectedGoogleResult: null,
      registryMatch: null,
      confidence: 0,
      matchReason: reason,
      manuallyOverridden: false,
      renderOnMap: false,
    },
    registrySlug: null,
    googlePlaceId: null,
    formattedAddress: null,
  };
}

/**
 * Shared async location-resolution pipeline for URInvolved events.
 *
 * Priority:
 * 1. canonical URI venue registry (exact venue name/alias -> trusted coords)
 * 2. verified campus building registry
 * 3. catalog / alias auto-match (sync matcher)
 * 4. Google geocode using the canonical venue name + URI/Kingston context
 * 5. unresolved (no default map position)
 */
export async function resolveEventLocationAsync(args: {
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  forceGoogle?: boolean;
  fetchImpl?: typeof fetch;
  context?: EventLocationDiagnosticContext;
}): Promise<EventLocationResolutionResult> {
  const sourceText = rawLocationFromFields(args.fields);
  const building = extractBuildingName(sourceText);
  const canonicalVenue = resolveUriCanonicalVenueFromFields(args.fields);

  // Trusted venue coordinates outrank a re-geocode: forceGoogle exists to
  // refresh buildings we don't already know, not to second-guess a named venue.
  const canonical = matchCanonicalUriVenue(args.fields, args.catalog);
  if (canonical) {
    return canonicalVenueResult(building, sourceText, canonical);
  }

  const registry = await loadCampusBuildingRegistry();

  const registryHit = matchCanonicalSafeRegistryEntry(sourceText, registry);
  if (registryHit?.verified) {
    return registryMatch(building, registryHit, sourceText, "verified_registry", 1, args.catalog);
  }

  if (!args.forceGoogle) {
    const auto = matchEventLocationWithMeta(args.fields, args.catalog);
    if (auto && auto.meta.confidence >= MIN_PUBLIC_MAP_CONFIDENCE) {
      const renderOnMap = auto.meta.confidence >= MIN_PUBLIC_MAP_CONFIDENCE;
      return {
        match: auto.match,
        meta: auto.meta,
        debug: {
          originalLocationText: sourceText,
          normalizedBuildingName: building,
          selectedGoogleResult: null,
          registryMatch: registryHit,
          confidence: auto.meta.confidence,
          matchReason: auto.meta.matchReason,
          manuallyOverridden: false,
          renderOnMap,
        },
        registrySlug: auto.match.kind === "realm" ? auto.match.realmLocationId : registryHit?.slug ?? null,
        googlePlaceId: registryHit?.googlePlaceId ?? null,
        formattedAddress: registryHit?.formattedAddress ?? null,
      };
    }

    if (registryHit) {
      return registryMatch(
        building,
        registryHit,
        sourceText,
        registryHit.verified ? "verified_registry" : "registry_match",
        registryHit.verified ? 1 : 0.92,
        args.catalog,
      );
    }
  }

  // Known venue with no trusted coordinates yet — geocode the canonical name
  // (with URI/Kingston context) instead of the raw feed text.
  const geocodeName = canonicalVenue?.venue.name ?? building;
  if (!geocodeName || geocodeName.length < 4) {
    return unresolved(sourceText, building, "insufficient_location_text", args.context);
  }

  const geocode = await geocodeUriBuilding({ buildingName: geocodeName, fetchImpl: args.fetchImpl });
  if (!geocode) {
    if (registryHit) {
      return registryMatch(building, registryHit, sourceText, "registry_fallback", 0.8, args.catalog);
    }
    return unresolved(sourceText, building, "google_unresolved", args.context);
  }

  const saved = await upsertBuildingFromGeocode({
    buildingName: geocodeName,
    geocode,
    sourceText,
  });

  return googleMatch(
    building,
    sourceText,
    geocode,
    saved,
    geocode.confidence >= 0.9 ? "google_place" : "google_geocode_fallback",
  );
}

/** Fast sync lookup against warmed registry rows (no Google call). */
export function resolveEventLocationFromRegistrySync(args: {
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  registry: CampusBuildingRegistryEntry[];
  catalog: CatalogLocationLike[];
  context?: EventLocationDiagnosticContext;
}): EventLocationResolutionResult {
  const sourceText = rawLocationFromFields(args.fields);
  const building = extractBuildingName(sourceText);

  const canonical = matchCanonicalUriVenue(args.fields, args.catalog);
  if (canonical) {
    return canonicalVenueResult(building, sourceText, canonical);
  }

  const registryHit = matchCanonicalSafeRegistryEntry(sourceText, args.registry);

  if (registryHit?.verified) {
    return registryMatch(building, registryHit, sourceText, "verified_registry", 1, args.catalog);
  }
  if (registryHit) {
    return registryMatch(building, registryHit, sourceText, "registry_match", 0.92, args.catalog);
  }

  const auto = matchEventLocationWithMeta(args.fields, args.catalog);
  if (auto && auto.meta.confidence >= MIN_PUBLIC_MAP_CONFIDENCE) {
    return {
      match: auto.match,
      meta: auto.meta,
      debug: {
        originalLocationText: sourceText,
        normalizedBuildingName: building,
        selectedGoogleResult: null,
        registryMatch: null,
        confidence: auto.meta.confidence,
        matchReason: auto.meta.matchReason,
        manuallyOverridden: false,
        renderOnMap: true,
      },
      registrySlug: auto.match.kind === "realm" ? auto.match.realmLocationId : null,
      googlePlaceId: null,
      formattedAddress: null,
    };
  }

  return unresolved(sourceText, building, auto ? "low_confidence" : "unmatched", args.context);
}

export { normalizeCampusLocationName, extractBuildingName };
