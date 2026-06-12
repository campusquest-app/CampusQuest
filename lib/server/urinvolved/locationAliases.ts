import type { RealmLocationId } from "@/lib/realm/locations";
import { REALM_LOCATION_GEO, REALM_LOCATION_IDS } from "@/lib/realm/locationGeo";

export type LocationMatchSource = "venue" | "location_name" | "address" | "description";

export type LocationMatch = {
  latitude: number;
  longitude: number;
  realmLocationId?: RealmLocationId;
  /** True when coordinates come from an existing CampusQuest realm map pin. */
  mapPinAvailable: boolean;
  matchedBy?: LocationMatchSource;
};

type AliasEntry = {
  aliases: string[];
  /** Street addresses and normalized address fragments for this location. */
  addressAliases?: string[];
  realmLocationId?: RealmLocationId;
  /** Override coords when not tied to a realm pin (e.g. Ryan Center). */
  coordinates?: { latitude: number; longitude: number };
};

const ALIAS_ENTRIES: AliasEntry[] = [
  {
    aliases: ["memorial union", "mu", "uri memorial union", "memorial union building"],
    addressAliases: [
      "50 lower college rd kingston ri 02881",
      "50 lower college rd",
      "50 lower college road",
    ],
    realmLocationId: "memorial-union",
  },
  {
    aliases: [
      "robert l carothers library",
      "carothers library",
      "uri library",
      "library",
      "carothers library and learning commons",
    ],
    addressAliases: [
      "15 lippitt rd kingston ri 02881",
      "15 lippitt rd",
      "15 lippitt road",
    ],
    realmLocationId: "library",
  },
  {
    aliases: ["ryan center", "thomas m ryan center", "ryan center arena"],
    coordinates: { latitude: 41.4865, longitude: -71.5298 },
  },
  {
    aliases: ["mackal", "mackal field house", "mackal gym", "mackal fieldhouse"],
    coordinates: { latitude: 41.4856, longitude: -71.5291 },
    realmLocationId: "rec-center",
  },
  {
    aliases: ["quad", "quadrangle", "uri quad", "uri quadrangle", "the quad"],
    addressAliases: [
      "5 lippitt rd kingston ri 02881",
      "5 lippitt rd",
      "5 lippitt road",
    ],
    realmLocationId: "the-quad",
  },
  {
    aliases: [
      "rec center",
      "recreation center",
      "uri recreation center",
      "uri rec center",
      "campus recreation center",
      "anna fascitelli fitness and wellness center",
      "fascitelli fitness center",
      "tootell athletic center",
    ],
    addressAliases: [
      "18 butterfield rd kingston ri 02881",
      "18 butterfield rd",
      "18 butterfield road",
    ],
    realmLocationId: "rec-center",
  },
  {
    aliases: ["rams den", "ram's den"],
    realmLocationId: "rams-den",
  },
  {
    aliases: ["engineering hall", "uri engineering"],
    realmLocationId: "engineering-hall",
  },
  {
    aliases: ["business building", "college of business", "ballentine hall"],
    realmLocationId: "business-building",
  },
  {
    aliases: ["contemporary arts center", "cfa", "fine arts center", "uri fine arts"],
    coordinates: { latitude: 41.4863, longitude: -71.5316 },
  },
  {
    aliases: [
      "multicultural student services center",
      "multicultural student services center-hardge forum",
      "mssc",
      "hardge forum",
    ],
    coordinates: { latitude: 41.4869, longitude: -71.5294 },
    realmLocationId: "memorial-union",
  },
  {
    aliases: ["barlow hall", "barlow hall-lounge", "barlow hall-outside", "barlow circle"],
    coordinates: { latitude: 41.4818, longitude: -71.5311 },
  },
  {
    aliases: ["donigan park"],
    coordinates: { latitude: 41.4372, longitude: -71.5034 },
  },
];

const STREET_SUFFIX_PATTERN = /\b(road|rd|street|st|avenue|ave|drive|dr|lane|ln|boulevard|blvd)\b/g;
const GLUED_CITY_PATTERN =
  /(road|rd|street|st|avenue|ave|drive|dr|lane|ln|boulevard|blvd)(kingston|providence)/gi;

export function hasCampusMapPin(realmLocationId: RealmLocationId | undefined): boolean {
  if (!realmLocationId) return false;
  return (REALM_LOCATION_IDS as readonly string[]).includes(realmLocationId);
}

export function normalizeLocationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize street addresses for fuzzy URI campus matching. */
export function normalizeAddressForMatching(value: string): string {
  let normalized = value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[,;#]/g, " ")
    .replace(/\./g, "")
    .replace(GLUED_CITY_PATTERN, "$1 $2")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized.replace(STREET_SUFFIX_PATTERN, (suffix) => {
    if (suffix === "road" || suffix === "rd") return "rd";
    if (suffix === "street" || suffix === "st") return "st";
    if (suffix === "avenue" || suffix === "ave") return "ave";
    if (suffix === "drive" || suffix === "dr") return "dr";
    if (suffix === "lane" || suffix === "ln") return "ln";
    if (suffix === "boulevard" || suffix === "blvd") return "blvd";
    return suffix;
  });

  return normalized.replace(/\s+/g, " ").trim();
}

function nameAliasMatches(normalized: string, alias: string): boolean {
  if (!normalized || !alias) return false;
  return normalized === alias || normalized.includes(alias) || alias.includes(normalized);
}

function addressAliasMatches(normalized: string, alias: string): boolean {
  if (!normalized || !alias) return false;
  if (normalized === alias) return true;
  if (normalized.startsWith(`${alias} `)) return true;
  if (alias.startsWith(`${normalized} `)) return true;
  return false;
}

function findAliasEntry(value: string): AliasEntry | null {
  const normalizedName = normalizeLocationName(value);
  const normalizedAddress = normalizeAddressForMatching(value);

  for (const entry of ALIAS_ENTRIES) {
    for (const alias of entry.aliases) {
      if (nameAliasMatches(normalizedName, alias)) return entry;
    }
    for (const alias of entry.addressAliases ?? []) {
      const normalizedAlias = normalizeAddressForMatching(alias);
      if (addressAliasMatches(normalizedAddress, normalizedAlias)) return entry;
    }
  }

  return null;
}

function resolveEntryCoordinates(entry: AliasEntry, matchedBy?: LocationMatchSource): LocationMatch | null {
  if (entry.realmLocationId && hasCampusMapPin(entry.realmLocationId)) {
    const geo = REALM_LOCATION_GEO[entry.realmLocationId];
    return {
      latitude: geo.latitude,
      longitude: geo.longitude,
      realmLocationId: entry.realmLocationId,
      mapPinAvailable: true,
      matchedBy,
    };
  }

  if (entry.coordinates && !entry.realmLocationId) {
    return {
      latitude: entry.coordinates.latitude,
      longitude: entry.coordinates.longitude,
      mapPinAvailable: false,
      matchedBy,
    };
  }

  return null;
}

export type ResolvedCampusLocation = {
  locationMatch: LocationMatch | null;
  matchedBy: LocationMatchSource | null;
  aliasMatched: boolean;
  mapPinAvailable: boolean;
};

function matchField(
  value: string | null | undefined,
  matchedBy: LocationMatchSource,
): ResolvedCampusLocation | null {
  if (!value?.trim()) return null;
  const entry = findAliasEntry(value);
  if (!entry) return null;

  const locationMatch = resolveEntryCoordinates(entry, matchedBy);
  return {
    locationMatch,
    matchedBy,
    aliasMatched: true,
    mapPinAvailable: Boolean(locationMatch?.mapPinAvailable),
  };
}

export function resolveCampusLocationFromEventFields(input: {
  venueName?: string | null;
  locationName?: string | null;
  address?: string | null;
  description?: string | null;
}): ResolvedCampusLocation {
  const attempts: Array<[string | null | undefined, LocationMatchSource]> = [
    [input.venueName, "venue"],
    [input.locationName, "location_name"],
    [input.address, "address"],
  ];

  for (const [value, source] of attempts) {
    const result = matchField(value, source);
    if (result) return result;
  }

  return {
    locationMatch: null,
    matchedBy: null,
    aliasMatched: false,
    mapPinAvailable: false,
  };
}

/**
 * Match a URInvolved location string to known campus coordinates.
 * Returns null when no confident alias match or when no map pin/coordinates are available.
 */
export function matchCampusLocation(locationName: string | null | undefined): LocationMatch | null {
  if (!locationName?.trim()) return null;
  const entry = findAliasEntry(locationName);
  if (!entry) return null;
  return resolveEntryCoordinates(entry);
}

export function externalEventQualifiesForMap(args: {
  latitude: number | null;
  longitude: number | null;
  resolved: ResolvedCampusLocation;
}): boolean {
  if (args.latitude == null || args.longitude == null) return false;
  if (args.resolved.mapPinAvailable) return true;
  if (args.resolved.locationMatch && !args.resolved.locationMatch.realmLocationId) return true;
  return false;
}
