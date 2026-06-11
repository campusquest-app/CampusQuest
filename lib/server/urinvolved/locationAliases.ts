import type { RealmLocationId } from "@/lib/realm/locations";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";

export type LocationMatch = {
  latitude: number;
  longitude: number;
  realmLocationId?: RealmLocationId;
};

type AliasEntry = {
  aliases: string[];
  realmLocationId?: RealmLocationId;
  /** Override coords when not tied to a realm pin (e.g. Ryan Center). */
  coordinates?: { latitude: number; longitude: number };
};

const ALIAS_ENTRIES: AliasEntry[] = [
  {
    aliases: ["memorial union", "mu", "uri memorial union", "memorial union building"],
    realmLocationId: "memorial-union",
  },
  {
    aliases: [
      "robert l. carothers library",
      "carothers library",
      "uri library",
      "library",
      "carothers library and learning commons",
    ],
    realmLocationId: "library",
  },
  {
    aliases: ["ryan center", "thomas m. ryan center", "ryan center arena"],
    coordinates: { latitude: 41.4865, longitude: -71.5298 },
  },
  {
    aliases: ["mackal", "mackal field house", "mackal gym", "mackal fieldhouse"],
    coordinates: { latitude: 41.4856, longitude: -71.5291 },
    realmLocationId: "rec-center",
  },
  {
    aliases: ["quad", "quadrangle", "uri quad", "the quad"],
    realmLocationId: "the-quad",
  },
  {
    aliases: ["rec center", "recreation center", "uri recreation center", "tootell athletic center"],
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

function normalizeLocationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a URInvolved location string to known campus coordinates.
 * Returns null when no confident alias match — never guesses coordinates.
 */
export function matchCampusLocation(locationName: string | null | undefined): LocationMatch | null {
  if (!locationName?.trim()) return null;
  const normalized = normalizeLocationName(locationName);
  if (!normalized) return null;

  for (const entry of ALIAS_ENTRIES) {
    for (const alias of entry.aliases) {
      if (normalized === alias || normalized.includes(alias) || alias.includes(normalized)) {
        if (entry.coordinates) {
          return {
            latitude: entry.coordinates.latitude,
            longitude: entry.coordinates.longitude,
            realmLocationId: entry.realmLocationId,
          };
        }
        if (entry.realmLocationId) {
          const geo = REALM_LOCATION_GEO[entry.realmLocationId];
          return {
            latitude: geo.latitude,
            longitude: geo.longitude,
            realmLocationId: entry.realmLocationId,
          };
        }
      }
    }
  }

  return null;
}
