import {
  normalizeCampusLocationName,
} from "@/lib/server/urinvolved/normalizeCampusLocationName";
import {
  normalizeLocationName,
  resolveCampusLocationFromEventFields,
} from "@/lib/server/urinvolved/locationAliases";
import {
  URI_LOCATION_ALIASES,
  type CatalogLocationLike,
  type EventLocationMatch,
  type UriAliasTarget,
} from "@/lib/server/urinvolved/mapEventLocationTypes";

export { normalizeLocationName };

/** Min normalized length before containment matching is trusted (avoids "hall"). */
const CONTAINMENT_MIN_LENGTH = 6;
const FUZZY_MIN_CONFIDENCE = 0.65;
const REVIEW_CONFIDENCE_THRESHOLD = 0.9;

/** Normalize event location text for matching (room numbers stripped). */
export function normalizeEventLocationText(value: string): string {
  return normalizeCampusLocationName(value);
}

function stripSecondaryWords(value: string): string {
  return value
    .replace(/\b(hall|building|center|centre|auditorium|complex)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugToNormalizedName(slug: string): string {
  return normalizeEventLocationText(slug.replace(/-/g, " "));
}

export type EventLocationMatchMeta = {
  rawLocation: string;
  normalizedLocation: string;
  confidence: number;
  matchReason: string;
  needsReview: boolean;
  matchedText: string;
};

export type EventLocationMatchResult = {
  match: EventLocationMatch;
  meta: EventLocationMatchMeta;
};

type MatchCandidate = {
  match: EventLocationMatch;
  confidence: number;
  reason: string;
};

function matchCatalogEntry(
  normalized: string,
  catalog: CatalogLocationLike[],
): { entry: CatalogLocationLike; confidence: number; reason: string } | null {
  if (!normalized) return null;

  let containmentMatch: CatalogLocationLike | null = null;
  let containmentLength = 0;

  for (const entry of catalog) {
    const entryName = normalizeEventLocationText(entry.name);
    const entrySlug = slugToNormalizedName(entry.slug);
    if (entryName === normalized || entrySlug === normalized) {
      return { entry, confidence: 1, reason: "exact_catalog" };
    }

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

  if (containmentMatch) {
    return { entry: containmentMatch, confidence: 0.86, reason: "contains_catalog" };
  }
  return null;
}

function lookupAlias(normalized: string): { target: UriAliasTarget; confidence: number; reason: string } | null {
  const direct = URI_LOCATION_ALIASES[normalized];
  if (direct) return { target: direct, confidence: 0.95, reason: "exact_alias" };

  let best: UriAliasTarget | null = null;
  let bestLength = 0;
  for (const [alias, target] of Object.entries(URI_LOCATION_ALIASES)) {
    if (alias.length < CONTAINMENT_MIN_LENGTH) continue;
    if (normalized.includes(alias) && alias.length > bestLength) {
      best = target;
      bestLength = alias.length;
    }
  }
  if (best) return { target: best, confidence: 0.84, reason: "contains_alias" };
  return null;
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = a.split(" ").filter((t) => t.length > 2);
  const tokensB = b.split(" ").filter((t) => t.length > 2);
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const token of tokensA) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap / Math.max(tokensA.length, tokensB.length);
}

function fuzzyCatalogMatch(
  normalized: string,
  catalog: CatalogLocationLike[],
): { entry: CatalogLocationLike; confidence: number; reason: string } | null {
  let best: CatalogLocationLike | null = null;
  let bestScore = 0;

  const stripped = stripSecondaryWords(normalized);
  for (const entry of catalog) {
    for (const candidate of [normalizeEventLocationText(entry.name), slugToNormalizedName(entry.slug)]) {
      const score = Math.max(
        tokenOverlapScore(normalized, candidate),
        tokenOverlapScore(stripped, stripSecondaryWords(candidate)),
      );
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }

  if (!best || bestScore < FUZZY_MIN_CONFIDENCE) return null;
  return { entry: best, confidence: Math.min(0.78, bestScore), reason: "fuzzy_catalog" };
}

function buildMeta(raw: string, normalized: string, candidate: MatchCandidate): EventLocationMatchMeta {
  return {
    rawLocation: raw,
    normalizedLocation: normalized,
    confidence: candidate.confidence,
    matchReason: candidate.reason,
    needsReview: candidate.confidence < REVIEW_CONFIDENCE_THRESHOLD,
    matchedText: candidate.match.matchedText,
  };
}

function resolveAliasToMatch(
  value: string,
  normalized: string,
  alias: { target: UriAliasTarget; confidence: number; reason: string },
  catalog: CatalogLocationLike[],
): MatchCandidate | null {
  const viaAlias = matchCatalogEntry(normalizeEventLocationText(alias.target.name), catalog);
  if (viaAlias) {
    return {
      match: {
        kind: "realm",
        realmLocationId: viaAlias.entry.slug,
        locationName: viaAlias.entry.name,
        matchedText: value,
      },
      confidence: Math.max(alias.confidence, viaAlias.confidence),
      reason: "alias_catalog",
    };
  }
  if (alias.target.latitude != null && alias.target.longitude != null) {
    return {
      match: {
        kind: "coords",
        locationName: alias.target.name,
        latitude: alias.target.latitude,
        longitude: alias.target.longitude,
        matchedText: value,
      },
      confidence: alias.confidence,
      reason: alias.reason,
    };
  }
  return null;
}

/**
 * Match a URInvolved event location with confidence metadata.
 */
export function matchEventLocationWithMeta(
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  },
  catalog: CatalogLocationLike[],
): EventLocationMatchResult | null {
  const candidates = [fields.venueName, fields.locationName, fields.address];
  let best: MatchCandidate | null = null;

  for (const value of candidates) {
    if (!value?.trim()) continue;
    const normalized = normalizeEventLocationText(value);
    if (!normalized) continue;

    const direct = matchCatalogEntry(normalized, catalog);
    if (direct) {
      const candidate: MatchCandidate = {
        match: {
          kind: "realm",
          realmLocationId: direct.entry.slug,
          locationName: direct.entry.name,
          matchedText: value,
        },
        confidence: direct.confidence,
        reason: direct.reason,
      };
      if (!best || candidate.confidence > best.confidence) best = candidate;
      continue;
    }

    const alias = lookupAlias(normalized);
    if (alias) {
      const resolved = resolveAliasToMatch(value, normalized, alias, catalog);
      if (resolved && (!best || resolved.confidence > best.confidence)) best = resolved;
      continue;
    }

    const fuzzy = fuzzyCatalogMatch(normalized, catalog);
    if (fuzzy) {
      const candidate: MatchCandidate = {
        match: {
          kind: "realm",
          realmLocationId: fuzzy.entry.slug,
          locationName: fuzzy.entry.name,
          matchedText: value,
        },
        confidence: fuzzy.confidence,
        reason: fuzzy.reason,
      };
      if (!best || candidate.confidence > best.confidence) best = candidate;
    }
  }

  const hasSubstantialField = candidates.some(
    (value) => value && normalizeEventLocationText(value).length >= CONTAINMENT_MIN_LENGTH,
  );
  if (!best && hasSubstantialField) {
    const legacy = resolveCampusLocationFromEventFields(fields);
    const legacyMatch = legacy.locationMatch;
    if (legacyMatch?.realmLocationId && legacy.mapPinAvailable) {
      best = {
        match: {
          kind: "realm",
          realmLocationId: legacyMatch.realmLocationId,
          locationName: legacyMatch.realmLocationId.replace(/-/g, " "),
          matchedText: fields.venueName ?? fields.locationName ?? fields.address ?? "",
        },
        confidence: 0.8,
        reason: "legacy_alias",
      };
    } else if (legacyMatch && !legacyMatch.realmLocationId) {
      best = {
        match: {
          kind: "coords",
          locationName: fields.venueName ?? fields.locationName ?? "Campus location",
          latitude: legacyMatch.latitude,
          longitude: legacyMatch.longitude,
          matchedText: fields.venueName ?? fields.locationName ?? fields.address ?? "",
        },
        confidence: 0.75,
        reason: "legacy_address",
      };
    }
  }

  if (!best) return null;

  const raw =
    fields.venueName?.trim() || fields.locationName?.trim() || fields.address?.trim() || best.match.matchedText;
  const normalized = normalizeEventLocationText(raw);
  return { match: best.match, meta: buildMeta(raw, normalized, best) };
}

/** Back-compat wrapper used by existing map pipeline. */
export function mapEventToRealmLocation(
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  },
  catalog: CatalogLocationLike[],
): EventLocationMatch | null {
  return matchEventLocationWithMeta(fields, catalog)?.match ?? null;
}
