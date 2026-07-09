import {
  normalizeLocationName,
  resolveCampusLocationFromEventFields,
} from "@/lib/server/urinvolved/locationAliases";

export { normalizeLocationName };

export type CatalogLocationLike = {
  slug: string;
  name: string;
};

export type UriAliasTarget = {
  /** Canonical display name ("Weldin Hall"). */
  name: string;
  /**
   * Approximate campus coordinates. Used when the building is not a catalog
   * Realm location so the event can still pin on the map.
   */
  latitude?: number;
  longitude?: number;
};

/**
 * Common URI building aliases → canonical location. Keys and canonical names
 * are matched after `normalizeLocationName` (lowercase, punctuation stripped,
 * collapsed spaces), so "Weldin Hall!", "weldin  hall" and
 * "Weldin Hall First Floor Lounge" all resolve the same way.
 *
 * Coordinates matter for buildings that have no campus_locations catalog
 * entry — without them the event would be unmappable and silently dropped.
 */
export const URI_LOCATION_ALIASES: Record<string, UriAliasTarget> = {
  "weldin hall": { name: "Weldin Hall", latitude: 41.49135, longitude: -71.52814 },
  "weldin": { name: "Weldin Hall", latitude: 41.49135, longitude: -71.52814 },
  "swan hall": { name: "Swan Hall", latitude: 41.48725, longitude: -71.5317 },
  "swan auditorium": { name: "Swan Hall", latitude: 41.48725, longitude: -71.5317 },
  "edwards hall": { name: "Edwards Hall", latitude: 41.4887, longitude: -71.53065 },
  "edwards auditorium": { name: "Edwards Hall", latitude: 41.4887, longitude: -71.53065 },
  "chafee hall": { name: "Chafee Hall", latitude: 41.488, longitude: -71.5292 },
  "chafee social science center": { name: "Chafee Hall", latitude: 41.488, longitude: -71.5292 },
  "white hall": { name: "White Hall", latitude: 41.4895, longitude: -71.5285 },
  "green hall": { name: "Green Hall", latitude: 41.4869, longitude: -71.5323 },
  "roosevelt hall": { name: "Roosevelt Hall", latitude: 41.4876, longitude: -71.5309 },
  "washburn hall": { name: "Washburn Hall", latitude: 41.4873, longitude: -71.5304 },
  "lippitt hall": { name: "Lippitt Hall", latitude: 41.4869, longitude: -71.53 },
  "ranger hall": { name: "Ranger Hall", latitude: 41.4863, longitude: -71.5312 },
  "ranger": { name: "Ranger Hall", latitude: 41.4863, longitude: -71.5312 },
  "bliss hall": { name: "Bliss Hall", latitude: 41.4872, longitude: -71.5283 },
  "kelley hall": { name: "Kelley Hall", latitude: 41.487, longitude: -71.5288 },
  "pastore hall": { name: "Pastore Hall", latitude: 41.4866, longitude: -71.5294 },
  "beaupre center": { name: "Beaupre Center", latitude: 41.4853, longitude: -71.5301 },
  "beaupre": { name: "Beaupre Center", latitude: 41.4853, longitude: -71.5301 },
  "avedisian hall": { name: "Avedisian Hall", latitude: 41.4848, longitude: -71.5309 },
  "quinn hall": { name: "Quinn Hall", latitude: 41.4881, longitude: -71.5301 },
  "hope commons": { name: "Hope Commons", latitude: 41.4891, longitude: -71.5295 },
  "mainfare": { name: "Hope Commons", latitude: 41.4891, longitude: -71.5295 },
  "butterfield hall": { name: "Butterfield Hall", latitude: 41.4862, longitude: -71.5284 },
  "butterfield": { name: "Butterfield Hall", latitude: 41.4862, longitude: -71.5284 },
  "browning hall": { name: "Browning Hall", latitude: 41.4906, longitude: -71.5288 },
  "hillside hall": { name: "Hillside Hall", latitude: 41.4917, longitude: -71.5276 },
  "hillside": { name: "Hillside Hall", latitude: 41.4917, longitude: -71.5276 },
  "brookside hall": { name: "Brookside Hall", latitude: 41.492, longitude: -71.527 },
  "keaney gymnasium": { name: "Keaney Gym", latitude: 41.4853, longitude: -71.5319 },
  "keaney gym": { name: "Keaney Gym", latitude: 41.4853, longitude: -71.5319 },
  "keaney": { name: "Keaney Gym", latitude: 41.4853, longitude: -71.5319 },
  "meade stadium": { name: "Meade Stadium", latitude: 41.4844, longitude: -71.5328 },
  "boss arena": { name: "Boss Ice Arena", latitude: 41.4838, longitude: -71.5309 },
  "boss ice arena": { name: "Boss Ice Arena", latitude: 41.4838, longitude: -71.5309 },
  "higgins welcome center": { name: "Higgins Welcome Center", latitude: 41.4842, longitude: -71.5264 },
  "ryan center": { name: "Ryan Center", latitude: 41.4865, longitude: -71.5298 },
  "mackal": { name: "Rec Center" },
  "mackal field house": { name: "Rec Center" },
  "memorial union": { name: "Memorial Union" },
  "mu": { name: "Memorial Union" },
  "carothers library": { name: "Library" },
  "robert l carothers library": { name: "Library" },
  "library": { name: "Library" },
  "the quad": { name: "The Quad" },
  "quad": { name: "The Quad" },
  "quadrangle": { name: "The Quad" },
  "rec center": { name: "Rec Center" },
  "recreation center": { name: "Rec Center" },
  "fascitelli fitness": { name: "Rec Center" },
  "engineering hall": { name: "Engineering Hall" },
  "fascitelli center for advanced engineering": { name: "Engineering Hall" },
  "ballentine hall": { name: "Business Building" },
  "ballentine": { name: "Business Building" },
  "college of business": { name: "Business Building" },
  "rams den": { name: "Rams Den" },
  "ram s den": { name: "Rams Den" },
};

/** Min normalized length before containment matching is trusted (avoids "hall"). */
const CONTAINMENT_MIN_LENGTH = 6;

function slugToNormalizedName(slug: string): string {
  return normalizeLocationName(slug.replace(/-/g, " "));
}

function matchCatalogEntry(
  normalized: string,
  catalog: CatalogLocationLike[],
): CatalogLocationLike | null {
  if (!normalized) return null;

  let containmentMatch: CatalogLocationLike | null = null;
  let containmentLength = 0;

  for (const entry of catalog) {
    const entryName = normalizeLocationName(entry.name);
    const entrySlug = slugToNormalizedName(entry.slug);
    if (entryName === normalized || entrySlug === normalized) return entry;

    // Containment either way ("weldin hall lounge" ↔ "weldin hall"),
    // preferring the longest catalog name to avoid weak matches.
    for (const candidate of [entryName, entrySlug]) {
      if (candidate.length < CONTAINMENT_MIN_LENGTH) continue;
      if (normalized.includes(candidate) || (normalized.length >= CONTAINMENT_MIN_LENGTH && candidate.includes(normalized))) {
        if (candidate.length > containmentLength) {
          containmentMatch = entry;
          containmentLength = candidate.length;
        }
      }
    }
  }

  return containmentMatch;
}

function lookupAlias(normalized: string): UriAliasTarget | null {
  const direct = URI_LOCATION_ALIASES[normalized];
  if (direct) return direct;
  let best: UriAliasTarget | null = null;
  let bestLength = 0;
  for (const [alias, target] of Object.entries(URI_LOCATION_ALIASES)) {
    if (alias.length < CONTAINMENT_MIN_LENGTH) continue;
    if (normalized.includes(alias) && alias.length > bestLength) {
      best = target;
      bestLength = alias.length;
    }
  }
  return best;
}

export type EventLocationMatch =
  | {
      kind: "realm";
      realmLocationId: string;
      locationName: string;
      matchedText: string;
    }
  | {
      kind: "coords";
      locationName: string;
      latitude: number;
      longitude: number;
      matchedText: string;
    };

/**
 * Match a URInvolved event's location text to a Realm map location, trying
 * venue → location name → address. Resolution order per field:
 *  1. campus_locations catalog by normalized name/slug (exact then containment)
 *  2. URI alias table → catalog entry, else alias coordinates
 *  3. legacy address/name aliases (Memorial Union street addresses etc.)
 */
export function mapEventToRealmLocation(
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  },
  catalog: CatalogLocationLike[],
): EventLocationMatch | null {
  const candidates = [fields.venueName, fields.locationName, fields.address];

  for (const value of candidates) {
    if (!value?.trim()) continue;
    const normalized = normalizeLocationName(value);
    if (!normalized) continue;

    const direct = matchCatalogEntry(normalized, catalog);
    if (direct) {
      return { kind: "realm", realmLocationId: direct.slug, locationName: direct.name, matchedText: value };
    }

    const alias = lookupAlias(normalized);
    if (alias) {
      const viaAlias = matchCatalogEntry(normalizeLocationName(alias.name), catalog);
      if (viaAlias) {
        return { kind: "realm", realmLocationId: viaAlias.slug, locationName: viaAlias.name, matchedText: value };
      }
      if (alias.latitude != null && alias.longitude != null) {
        return {
          kind: "coords",
          locationName: alias.name,
          latitude: alias.latitude,
          longitude: alias.longitude,
          matchedText: value,
        };
      }
    }
  }

  // Legacy static aliases (Memorial Union, Library, …) resolve realm ids or
  // coordinates directly. Skipped for very short strings — the legacy matcher
  // does loose bidirectional containment ("hall" would match "engineering hall").
  const hasSubstantialField = candidates.some(
    (value) => value && normalizeLocationName(value).length >= CONTAINMENT_MIN_LENGTH,
  );
  if (!hasSubstantialField) return null;

  const legacy = resolveCampusLocationFromEventFields(fields);
  const legacyMatch = legacy.locationMatch;
  if (legacyMatch?.realmLocationId && legacy.mapPinAvailable) {
    return {
      kind: "realm",
      realmLocationId: legacyMatch.realmLocationId,
      locationName: legacyMatch.realmLocationId.replace(/-/g, " "),
      matchedText: fields.venueName ?? fields.locationName ?? fields.address ?? "",
    };
  }
  if (legacyMatch && !legacyMatch.realmLocationId) {
    return {
      kind: "coords",
      locationName: fields.venueName ?? fields.locationName ?? "Campus location",
      latitude: legacyMatch.latitude,
      longitude: legacyMatch.longitude,
      matchedText: fields.venueName ?? fields.locationName ?? fields.address ?? "",
    };
  }

  return null;
}
