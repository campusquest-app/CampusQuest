import type { RealmLocationId } from "@/lib/realm/locations";
import { isCampusLocationId, tryGetCampusLocation } from "@/lib/locations/campusLocationCatalog";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";

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
    aliases: [
      "weldin hall",
      "weldin hall first floor lounge",
      "weldin hall lounge",
      "weldin lounge",
      "weldin",
      "weldon hall",
      "weldon",
    ],
    realmLocationId: "weldin-hall",
    // Fallback when REALM_LOCATION_GEO / catalog rows are incomplete.
    coordinates: { latitude: 41.4908, longitude: -71.5294 },
  },
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
    aliases: ["keaney gymnasium", "keaney gym", "keaney"],
    coordinates: { latitude: 41.4853, longitude: -71.5319 },
  },
  {
    aliases: ["meade stadium", "meade stadium at uri"],
    coordinates: { latitude: 41.4844, longitude: -71.5328 },
  },
  {
    aliases: ["soccer complex", "uri soccer complex"],
    coordinates: { latitude: 41.4838, longitude: -71.5348 },
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
      "tootell aquatic center",
      "tootell",
    ],
    addressAliases: [
      "18 butterfield rd kingston ri 02881",
      "18 butterfield rd",
      "18 butterfield road",
    ],
    realmLocationId: "rec-center",
  },
  {
    aliases: [
      "butterfield",
      "butterfield dining",
      "butterfield dining hall",
      "butterfield hall",
      "uri butterfield",
    ],
    addressAliases: [
      "butterfield rd kingston ri",
      "butterfield road",
    ],
    realmLocationId: "butterfield-dining",
    coordinates: { latitude: 41.4862, longitude: -71.5284 },
  },
  {
    aliases: [
      "mainfare",
      "mainfare dining",
      "mainfare dining hall",
      "hope commons",
      "hope commons mainfare",
      "hope dining hall",
      "uri mainfare",
    ],
    realmLocationId: "mainfare-dining",
    coordinates: { latitude: 41.4891, longitude: -71.5295 },
  },
  {
    // Generic "dining hall" is ambiguous (Butterfield vs Mainfare) — do not force a pin.
    aliases: ["dining hall", "uri dining hall", "campus dining"],
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
  const geo = REALM_LOCATION_GEO[realmLocationId];
  if (hasValidCoordinates(geo)) return true;
  if (!isCampusLocationId(realmLocationId)) return false;
  return hasValidCoordinates(tryGetCampusLocation(realmLocationId));
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

  // Prefer exact name matches so short labels like "dining hall" do not bind to
  // longer aliases such as "butterfield dining hall".
  for (const entry of ALIAS_ENTRIES) {
    for (const alias of entry.aliases) {
      if (normalizedName === alias) return entry;
    }
  }

  for (const entry of ALIAS_ENTRIES) {
    for (const alias of entry.addressAliases ?? []) {
      const normalizedAlias = normalizeAddressForMatching(alias);
      if (addressAliasMatches(normalizedAddress, normalizedAlias)) return entry;
    }
  }

  let best: { entry: AliasEntry; score: number } | null = null;
  for (const entry of ALIAS_ENTRIES) {
    for (const alias of entry.aliases) {
      if (!normalizedName || !alias) continue;
      if (normalizedName.includes(alias)) {
        const score = 1000 + alias.length;
        if (!best || score > best.score) best = { entry, score };
      } else if (alias.includes(normalizedName) && normalizedName.length >= 5) {
        const score = normalizedName.length;
        if (!best || score > best.score) best = { entry, score };
      }
    }
  }

  return best?.entry ?? null;
}

function resolveEntryCoordinates(entry: AliasEntry, matchedBy?: LocationMatchSource): LocationMatch | null {
  if (entry.realmLocationId) {
    const geo = REALM_LOCATION_GEO[entry.realmLocationId];
    if (hasValidCoordinates(geo)) {
      return {
        latitude: geo.latitude,
        longitude: geo.longitude,
        realmLocationId: entry.realmLocationId,
        mapPinAvailable: true,
        matchedBy,
      };
    }

    // Catalog may include buildings that are not yet in REALM_LOCATION_GEO.
    const catalogEntry = tryGetCampusLocation(entry.realmLocationId);
    if (hasValidCoordinates(catalogEntry)) {
      return {
        latitude: catalogEntry.latitude,
        longitude: catalogEntry.longitude,
        realmLocationId: entry.realmLocationId,
        mapPinAvailable: true,
        matchedBy,
      };
    }
  }

  if (hasValidCoordinates(entry.coordinates)) {
    return {
      latitude: entry.coordinates.latitude,
      longitude: entry.coordinates.longitude,
      realmLocationId: entry.realmLocationId,
      mapPinAvailable: Boolean(entry.realmLocationId && hasCampusMapPin(entry.realmLocationId)),
      matchedBy,
    };
  }

  // Alias recognized but no usable coordinates — caller still imports the event.
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
  if (!hasValidCoordinates({ latitude: args.latitude, longitude: args.longitude })) return false;
  if (args.resolved.mapPinAvailable) return true;
  if (args.resolved.locationMatch && !args.resolved.locationMatch.realmLocationId) return true;
  return false;
}
