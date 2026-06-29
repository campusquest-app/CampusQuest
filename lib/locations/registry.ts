import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { REALM_LOCATIONS, REALM_LOCATION_OPTIONS, type RealmLocationId } from "@/lib/realm/locations";
import type { CampusLocationKey } from "@/lib/campusLocations";

/** Canonical campus location id — same ids used by Realm map pins and quad_posts.location_id. */
export type CampusLocationId = RealmLocationId;

export type CampusLocationRegistryEntry = {
  id: CampusLocationId;
  name: string;
  shortLabel: string;
  markerEmoji: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
  major: boolean;
  /** Legacy admin/QR key when applicable. */
  legacyCampusKey: CampusLocationKey | null;
  sortOrder: number;
};

const LEGACY_CAMPUS_KEY_BY_ID: Partial<Record<CampusLocationId, CampusLocationKey>> = {
  "the-quad": "quad",
  library: "library",
  "memorial-union": "memorial_union",
  "rec-center": "mackal_rec_center",
  "engineering-hall": "academic_building",
  "rams-den": "dining_hall",
};

const ID_BY_LEGACY_CAMPUS_KEY: Partial<Record<CampusLocationKey, CampusLocationId>> = {
  quad: "the-quad",
  library: "library",
  memorial_union: "memorial-union",
  mackal_rec_center: "rec-center",
  academic_building: "engineering-hall",
  dining_hall: "rams-den",
  ryan_center: "rams-den",
};

export const CAMPUS_LOCATION_IDS = REALM_LOCATION_OPTIONS.map((o) => o.id) as CampusLocationId[];

export const CAMPUS_LOCATION_REGISTRY: CampusLocationRegistryEntry[] = REALM_LOCATIONS.map((loc, index) => ({
  id: loc.id,
  name: loc.name,
  shortLabel: loc.shortLabel,
  markerEmoji: loc.markerEmoji,
  latitude: REALM_LOCATION_GEO[loc.id].latitude,
  longitude: REALM_LOCATION_GEO[loc.id].longitude,
  mapX: loc.x,
  mapY: loc.y,
  major: loc.major,
  legacyCampusKey: LEGACY_CAMPUS_KEY_BY_ID[loc.id] ?? null,
  sortOrder: index,
}));

const REGISTRY_BY_ID = new Map(CAMPUS_LOCATION_REGISTRY.map((e) => [e.id, e]));

export function isCampusLocationId(value: string | null | undefined): value is CampusLocationId {
  return Boolean(value && REGISTRY_BY_ID.has(value as CampusLocationId));
}

export function getCampusLocation(id: CampusLocationId): CampusLocationRegistryEntry {
  const entry = REGISTRY_BY_ID.get(id);
  if (!entry) throw new Error(`Unknown campus location id: ${id}`);
  return entry;
}

export function getCampusLocationName(id: CampusLocationId): string {
  return getCampusLocation(id).name;
}

export function campusLocationIdFromLegacyKey(key: string | null | undefined): CampusLocationId | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (isCampusLocationId(trimmed)) return trimmed;
  return ID_BY_LEGACY_CAMPUS_KEY[trimmed as CampusLocationKey] ?? null;
}

export function legacyCampusKeyFromLocationId(id: CampusLocationId): CampusLocationKey | null {
  return getCampusLocation(id).legacyCampusKey;
}

/** Dropdown options for Add Memory — canonical ids only. */
export const CAMPUS_MEMORY_LOCATION_OPTIONS = CAMPUS_LOCATION_REGISTRY.filter((e) => e.major || e.id !== "business-building").map(
  (e) => ({ id: e.id, name: e.name, shortLabel: e.shortLabel }),
);

export function sortMemoryGroups<T extends { locationId: CampusLocationId; hasRecent: boolean; count: number }>(
  groups: T[],
): T[] {
  return [...groups].sort((a, b) => {
    if (a.hasRecent !== b.hasRecent) return a.hasRecent ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    return getCampusLocation(a.locationId).sortOrder - getCampusLocation(b.locationId).sortOrder;
  });
}
