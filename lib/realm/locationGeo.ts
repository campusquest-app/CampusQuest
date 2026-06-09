import type { RealmLocationId } from "@/lib/realm/locations";

/** Approximate URI campus coordinates for Realm Moment map metadata. */
export const REALM_LOCATION_IDS = [
  "memorial-union",
  "library",
  "rec-center",
  "engineering-hall",
  "business-building",
  "the-quad",
  "rams-den",
] as const satisfies readonly RealmLocationId[];

export const REALM_LOCATION_GEO: Record<RealmLocationId, { latitude: number; longitude: number }> = {
  "memorial-union": { latitude: 41.4868, longitude: -71.5301 },
  library: { latitude: 41.4876, longitude: -71.5312 },
  "rec-center": { latitude: 41.4849, longitude: -71.5288 },
  "engineering-hall": { latitude: 41.4888, longitude: -71.5295 },
  "business-building": { latitude: 41.4892, longitude: -71.5282 },
  "the-quad": { latitude: 41.4871, longitude: -71.5305 },
  "rams-den": { latitude: 41.4862, longitude: -71.5318 },
};

export function isRealmLocationId(value: string): value is RealmLocationId {
  return (REALM_LOCATION_IDS as readonly string[]).includes(value);
}
