import {
  normalizeLocationName,
  resolveCampusLocationFromEventFields,
} from "@/lib/server/urinvolved/locationAliases";

export { normalizeLocationName };

export type CatalogLocationLike = {
  slug: string;
  name: string;
};

/**
 * Common URI building aliases → canonical location name. Keys and values are
 * matched after `normalizeLocationName` (lowercase, punctuation stripped,
 * collapsed spaces), so "Weldin Hall!", "weldin  hall" and "weldin hall-lounge"
 * all resolve the same way.
 */
export const URI_LOCATION_ALIASES: Record<string, string> = {
  "weldin hall": "Weldin Hall",
  "swan hall": "Swan Hall",
  "swan auditorium": "Swan Hall",
  "edwards hall": "Edwards Hall",
  "edwards auditorium": "Edwards Hall",
  "chafee hall": "Chafee Hall",
  "chafee social science center": "Chafee Hall",
  "white hall": "White Hall",
  "green hall": "Green Hall",
  "roosevelt hall": "Roosevelt Hall",
  "washburn hall": "Washburn Hall",
  "lippitt hall": "Lippitt Hall",
  "ranger hall": "Ranger Hall",
  "bliss hall": "Bliss Hall",
  "kelley hall": "Kelley Hall",
  "pastore hall": "Pastore Hall",
  "beaupre center": "Beaupre Center",
  "avedisian hall": "Avedisian Hall",
  "quinn hall": "Quinn Hall",
  "hope commons": "Hope Commons",
  "mainfare": "Hope Commons",
  "butterfield hall": "Butterfield Hall",
  "browning hall": "Browning Hall",
  "hillside hall": "Hillside Hall",
  "brookside hall": "Brookside Hall",
  "keaney gymnasium": "Keaney Gym",
  "keaney gym": "Keaney Gym",
  "meade stadium": "Meade Stadium",
  "boss arena": "Boss Ice Arena",
  "boss ice arena": "Boss Ice Arena",
  "higgins welcome center": "Higgins Welcome Center",
  "memorial union": "Memorial Union",
  "carothers library": "Library",
  "library": "Library",
  "the quad": "The Quad",
  "quadrangle": "The Quad",
  "rec center": "Rec Center",
  "recreation center": "Rec Center",
  "fascitelli fitness": "Rec Center",
  "engineering hall": "Engineering Hall",
  "fascitelli center for advanced engineering": "Engineering Hall",
  "ballentine hall": "Business Building",
  "college of business": "Business Building",
  "rams den": "Rams Den",
  "ram s den": "Rams Den",
  "ryan center": "Ryan Center",
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

function lookupAlias(normalized: string): string | null {
  const direct = URI_LOCATION_ALIASES[normalized];
  if (direct) return direct;
  for (const [alias, canonical] of Object.entries(URI_LOCATION_ALIASES)) {
    if (alias.length < CONTAINMENT_MIN_LENGTH) continue;
    if (normalized.includes(alias)) return canonical;
  }
  return null;
}

export type EventLocationMatch = {
  realmLocationId: string;
  matchedText: string;
};

/**
 * Match a URInvolved event's location text to an existing Realm map location.
 * Tries venue → location name → address; each via direct catalog name/slug
 * matching, then the URI alias table, then the legacy coordinate aliases.
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
    if (direct) return { realmLocationId: direct.slug, matchedText: value };

    const aliasCanonical = lookupAlias(normalized);
    if (aliasCanonical) {
      const viaAlias = matchCatalogEntry(normalizeLocationName(aliasCanonical), catalog);
      if (viaAlias) return { realmLocationId: viaAlias.slug, matchedText: value };
    }
  }

  // Legacy static aliases (Memorial Union, Library, …) resolve realm ids
  // directly. Skipped for very short strings — the legacy matcher does loose
  // bidirectional containment ("hall" would match "engineering hall").
  const hasSubstantialField = candidates.some(
    (value) => value && normalizeLocationName(value).length >= CONTAINMENT_MIN_LENGTH,
  );
  if (!hasSubstantialField) return null;

  const legacy = resolveCampusLocationFromEventFields(fields);
  const legacyId = legacy.locationMatch?.realmLocationId;
  if (legacyId && legacy.mapPinAvailable) {
    return {
      realmLocationId: legacyId,
      matchedText: fields.venueName ?? fields.locationName ?? fields.address ?? "",
    };
  }

  return null;
}
