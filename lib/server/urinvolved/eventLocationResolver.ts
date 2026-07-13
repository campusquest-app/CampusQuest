import type { CatalogLocationLike, EventLocationMatch } from "@/lib/server/urinvolved/mapEventLocationTypes";
import {
  geocodeUriBuilding,
  MIN_PUBLIC_MAP_CONFIDENCE,
  type GoogleGeocodeResult,
} from "@/lib/server/geocoding/googleCampusGeocoder";
import {
  loadCampusBuildingRegistry,
  matchBuildingRegistryEntry,
  upsertBuildingFromGeocode,
  type CampusBuildingRegistryEntry,
} from "@/lib/server/urinvolved/campusBuildingRegistry";
import {
  extractBuildingName,
  normalizeCampusLocationName,
} from "@/lib/server/urinvolved/normalizeCampusLocationName";
import {
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

function coordsMatch(
  building: string,
  entry: CampusBuildingRegistryEntry,
  sourceText: string,
  reason: string,
  confidence: number,
): EventLocationResolutionResult {
  const match: EventLocationMatch = {
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

function googleMatch(
  building: string,
  sourceText: string,
  geocode: GoogleGeocodeResult,
  registry: CampusBuildingRegistryEntry | null,
  reason: string,
): EventLocationResolutionResult {
  const match: EventLocationMatch = {
    kind: "coords",
    locationName: registry?.canonicalName ?? geocode.name,
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

function unresolved(sourceText: string, building: string, reason: string): EventLocationResolutionResult {
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
 * 1. verified campus building registry
 * 2. catalog / alias auto-match (sync matcher)
 * 3. Google geocode for URI building
 * 4. unresolved (no default map position)
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
}): Promise<EventLocationResolutionResult> {
  const sourceText = rawLocationFromFields(args.fields);
  const building = extractBuildingName(sourceText);
  const registry = await loadCampusBuildingRegistry();

  const registryHit = matchBuildingRegistryEntry(sourceText, registry);
  if (registryHit?.verified) {
    return coordsMatch(building, registryHit, sourceText, "verified_registry", 1);
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
      return coordsMatch(
        building,
        registryHit,
        sourceText,
        registryHit.verified ? "verified_registry" : "registry_match",
        registryHit.verified ? 1 : 0.92,
      );
    }
  }

  if (!building || building.length < 4) {
    return unresolved(sourceText, building, "insufficient_location_text");
  }

  const geocode = await geocodeUriBuilding({ buildingName: building, fetchImpl: args.fetchImpl });
  if (!geocode) {
    if (registryHit) {
      return coordsMatch(building, registryHit, sourceText, "registry_fallback", 0.8);
    }
    return unresolved(sourceText, building, "google_unresolved");
  }

  const saved = await upsertBuildingFromGeocode({
    buildingName: building,
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
}): EventLocationResolutionResult {
  const sourceText = rawLocationFromFields(args.fields);
  const building = extractBuildingName(sourceText);
  const registryHit = matchBuildingRegistryEntry(sourceText, args.registry);

  if (registryHit?.verified) {
    return coordsMatch(building, registryHit, sourceText, "verified_registry", 1);
  }
  if (registryHit) {
    return coordsMatch(building, registryHit, sourceText, "registry_match", 0.92);
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

  return unresolved(sourceText, building, auto ? "low_confidence" : "unmatched");
}

export { normalizeCampusLocationName, extractBuildingName };
