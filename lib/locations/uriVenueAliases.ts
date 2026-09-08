import type { RealmLocationId } from "@/lib/realm/locations";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { normalizeCampusLocationName } from "@/lib/server/urinvolved/normalizeCampusLocationName";

/**
 * Authoritative URI venue registry.
 *
 * This is the single source of truth for "what venue does this feed string
 * mean". It is matched by normalized equality only — never by substring
 * containment — so a feed value like "URI Soccer Complex" can never be pulled
 * onto a different campus landmark by a fuzzy catalog/registry hit.
 *
 * Venues without coordinates are still canonicalized here; their coordinates
 * are resolved by Google geocoding using `name` plus URI/Kingston context.
 * Nothing in this module invents a position.
 */
export type UriCanonicalVenue = {
  id: string;
  /** Display name, and the text used to build a Google geocode query. */
  name: string;
  /** Existing Realm landmark this venue is the same place as, when one exists. */
  realmLocationId: RealmLocationId | null;
  /** Verified venue coordinates. Omitted when we have no trusted position yet. */
  latitude?: number;
  longitude?: number;
  /** True when the venue is on URI's Kingston campus (enables bounds validation). */
  onKingstonCampus: boolean;
  /** Feed spellings, written as they appear in source data. */
  aliases: string[];
};

const CANONICAL_VENUES: UriCanonicalVenue[] = [
  {
    id: "uri-soccer-complex",
    name: "URI Soccer Complex",
    realmLocationId: null,
    latitude: 41.4838,
    longitude: -71.5348,
    onKingstonCampus: true,
    aliases: [
      "URI Soccer Complex",
      "Soccer Complex",
      "URI Soccer Field",
      "Soccer Field",
      "Rhode Island Soccer Complex",
      "URI Soccer Stadium",
      "Soccer Stadium",
    ],
  },
  {
    id: "meade-stadium",
    name: "Meade Stadium",
    realmLocationId: null,
    latitude: 41.4844,
    longitude: -71.5328,
    onKingstonCampus: true,
    aliases: [
      "Meade Stadium",
      "Meade Stadium at URI",
      "William C. Meade Stadium",
      "Meade Field",
    ],
  },
  {
    id: "ryan-center",
    name: "Ryan Center",
    realmLocationId: null,
    latitude: 41.4865,
    longitude: -71.5298,
    onKingstonCampus: true,
    aliases: [
      "Ryan Center",
      "The Ryan Center",
      "Thomas M. Ryan Center",
      "Thomas M. Ryan Center for Athletics",
      "Ryan Center Arena",
    ],
  },
  {
    id: "boss-ice-arena",
    name: "Boss Ice Arena",
    realmLocationId: null,
    latitude: 41.4838,
    longitude: -71.5309,
    onKingstonCampus: true,
    aliases: [
      "Boss Ice Arena",
      "Boss Arena",
      "Bradford R. Boss Ice Arena",
      "Boss Ice Rink",
    ],
  },
  {
    id: "keaney-gymnasium",
    // Display name matches the existing map pin label.
    name: "Keaney Gym",
    realmLocationId: null,
    latitude: 41.4853,
    longitude: -71.5319,
    onKingstonCampus: true,
    aliases: ["Keaney Gymnasium", "Keaney Gym", "Keaney", "Frank Keaney Gymnasium"],
  },
  {
    // No trusted coordinates yet — canonicalized so geocoding gets clean context.
    id: "uri-softball-complex",
    name: "URI Softball Complex",
    realmLocationId: null,
    onKingstonCampus: true,
    aliases: [
      "URI Softball Complex",
      "Softball Complex",
      "URI Softball Field",
      "Softball Field",
      "Rhode Island Softball Complex",
    ],
  },
  {
    id: "uri-tennis-complex",
    name: "URI Tennis Complex",
    realmLocationId: null,
    onKingstonCampus: true,
    aliases: [
      "URI Tennis Complex",
      "Tennis Complex",
      "URI Tennis Courts",
      "Tennis Courts",
    ],
  },
  {
    id: "memorial-union",
    name: "Memorial Union",
    realmLocationId: "memorial-union",
    onKingstonCampus: true,
    aliases: [
      "Memorial Union",
      "Memorial Union Building",
      "URI Memorial Union",
      "MU",
    ],
  },
  {
    id: "carothers-library",
    name: "Robert L. Carothers Library",
    realmLocationId: "library",
    onKingstonCampus: true,
    aliases: [
      "Robert L. Carothers Library",
      "Robert L. Carothers Library and Learning Commons",
      "Carothers Library",
      "Carothers Library and Learning Commons",
      "URI Library",
      "Library",
    ],
  },
  {
    id: "the-quad",
    name: "The Quad",
    realmLocationId: "the-quad",
    onKingstonCampus: true,
    aliases: ["The Quad", "Quad", "Quadrangle", "URI Quadrangle"],
  },
  {
    id: "rec-center",
    name: "Rec Center",
    realmLocationId: "rec-center",
    onKingstonCampus: true,
    aliases: [
      "Rec Center",
      "Recreation Center",
      "URI Recreation Center",
      "Campus Recreation Center",
      "Mackal Field House",
      "Mackal Fieldhouse",
      "Tootell Athletic Center",
      "Anna Fascitelli Fitness and Wellness Center",
    ],
  },
];

type VenueIndexEntry = { venue: UriCanonicalVenue; alias: string };

const VENUE_INDEX: Map<string, VenueIndexEntry> = buildVenueIndex();

function buildVenueIndex(): Map<string, VenueIndexEntry> {
  const index = new Map<string, VenueIndexEntry>();
  for (const venue of CANONICAL_VENUES) {
    for (const alias of [venue.name, ...venue.aliases]) {
      const key = normalizeVenueText(alias);
      // Shortest-alias-wins keeps ambiguous keys bound to their own venue.
      if (!key || index.has(key)) continue;
      index.set(key, { venue, alias });
    }
  }
  return index;
}

/** Normalize venue text the same way the campus building matcher does. */
export function normalizeVenueText(value: string | null | undefined): string {
  if (!value) return "";
  return normalizeCampusLocationName(value);
}

/** Split feed location strings into the segments that may name a venue. */
function venueSegments(value: string): string[] {
  return value
    .split(/[,|/–—]|\s-\s|\bat\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export type UriCanonicalVenueMatch = {
  venue: UriCanonicalVenue;
  /** The alias text that matched, for logging / debugging. */
  matchedAlias: string;
  /** The normalized text that produced the match. */
  normalizedText: string;
};

/**
 * Exact canonical venue lookup. Returns null unless the whole string, or one
 * of its segments, normalizes to a known venue name/alias.
 */
export function resolveUriCanonicalVenue(
  value: string | null | undefined,
): UriCanonicalVenueMatch | null {
  if (!value?.trim()) return null;

  const whole = normalizeVenueText(value);
  const wholeHit = whole ? VENUE_INDEX.get(whole) : undefined;
  if (wholeHit) {
    return { venue: wholeHit.venue, matchedAlias: wholeHit.alias, normalizedText: whole };
  }

  // Longest segment first so "Soccer Complex, Field 2" prefers the venue name.
  const segments = venueSegments(value)
    .map((segment) => normalizeVenueText(segment))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const segment of segments) {
    const hit = VENUE_INDEX.get(segment);
    if (hit) {
      return { venue: hit.venue, matchedAlias: hit.alias, normalizedText: segment };
    }
  }

  return null;
}

/** Canonical venue lookup across the location fields an event can carry. */
export function resolveUriCanonicalVenueFromFields(fields: {
  venueName?: string | null;
  locationName?: string | null;
  address?: string | null;
}): UriCanonicalVenueMatch | null {
  for (const value of [fields.venueName, fields.locationName, fields.address]) {
    const hit = resolveUriCanonicalVenue(value);
    if (hit) return hit;
  }
  return null;
}

/**
 * Coordinates for a canonical venue: its own verified position, or the Realm
 * landmark it shares a location with. Null when neither is known — callers must
 * geocode or leave the event unresolved rather than guessing.
 */
export function canonicalVenueCoordinates(
  venue: UriCanonicalVenue,
): { latitude: number; longitude: number } | null {
  if (typeof venue.latitude === "number" && typeof venue.longitude === "number") {
    return { latitude: venue.latitude, longitude: venue.longitude };
  }
  if (venue.realmLocationId) {
    const geo = REALM_LOCATION_GEO[venue.realmLocationId];
    if (geo) return { latitude: geo.latitude, longitude: geo.longitude };
  }
  return null;
}

/** Geocode query text for a canonical venue with enough context to be unambiguous. */
export function canonicalVenueGeocodeQuery(venue: UriCanonicalVenue): string {
  return `${venue.name}, University of Rhode Island, Kingston, RI`;
}

export function listUriCanonicalVenues(): readonly UriCanonicalVenue[] {
  return CANONICAL_VENUES;
}
