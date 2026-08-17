import type { RealmLocationId } from "@/lib/realm/locations";

/** Approximate URI campus coordinates for Realm Moment map metadata. */
export const REALM_LOCATION_IDS = [
  "the-quad",
  "butterfield-dining",
  "mainfare-dining",
  "memorial-union",
  "library",
  "rec-center",
  "engineering-hall",
  "business-building",
  "rams-den",
  /** Retired — kept so historical location_id values still validate. */
  "dining-hall",
] as const satisfies readonly RealmLocationId[];

export const REALM_LOCATION_GEO: Record<string, { latitude: number; longitude: number }> = {
  "the-quad": { latitude: 41.4871, longitude: -71.5305 },
  "butterfield-dining": { latitude: 41.4862, longitude: -71.5284 },
  "mainfare-dining": { latitude: 41.4891, longitude: -71.5295 },
  /** Historical generic dining pin — not shown on the live map. */
  "dining-hall": { latitude: 41.4855, longitude: -71.5275 },
  "memorial-union": { latitude: 41.4868, longitude: -71.5301 },
  library: { latitude: 41.4876, longitude: -71.5312 },
  "rec-center": { latitude: 41.4849, longitude: -71.5288 },
  "engineering-hall": { latitude: 41.4888, longitude: -71.5295 },
  "business-building": { latitude: 41.4892, longitude: -71.5282 },
  "rams-den": { latitude: 41.4862, longitude: -71.5318 },
  "weldin-hall": { latitude: 41.4908, longitude: -71.5294 },
};

export function isRealmLocationId(value: string): value is RealmLocationId {
  return (REALM_LOCATION_IDS as readonly string[]).includes(value);
}

/** Visible map landmarks (excludes retired dining-hall). */
export function isActiveRealmMapLocationId(value: string): boolean {
  return isRealmLocationId(value) && value !== "dining-hall";
}
