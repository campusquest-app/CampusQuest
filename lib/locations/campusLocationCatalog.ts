import type { CampusLocationKey } from "@/lib/campusLocations";
import { EMPTY_REALM_ACTIVITY, REALM_LOCATIONS, type RealmLocation } from "@/lib/realm/locations";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";

/** Canonical campus location slug — built-in or admin-created. */
export type CampusLocationId = string;

export type CampusLocationRecord = {
  id: string;
  slug: CampusLocationId;
  name: string;
  description: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  mapX: number | null;
  mapY: number | null;
  markerEmoji: string;
  shortLabel: string;
  fantasyName: string;
  flavorText: string;
  major: boolean;
  legacyCampusKey: CampusLocationKey | null;
  sortOrder: number;
  isBuiltin: boolean;
  isActive: boolean;
};

export type CampusLocationRegistryEntry = CampusLocationRecord & {
  /** Alias for slug — used by legacy registry consumers. */
  id: CampusLocationId;
};

const LEGACY_CAMPUS_KEY_BY_SLUG: Partial<Record<string, CampusLocationKey>> = {
  "the-quad": "quad",
  library: "library",
  "memorial-union": "memorial_union",
  "rec-center": "mackal_rec_center",
  "engineering-hall": "academic_building",
  "rams-den": "dining_hall",
};

const ID_BY_LEGACY_CAMPUS_KEY: Partial<Record<CampusLocationKey, string>> = {
  quad: "the-quad",
  library: "library",
  memorial_union: "memorial-union",
  mackal_rec_center: "rec-center",
  academic_building: "engineering-hall",
  dining_hall: "rams-den",
  ryan_center: "rams-den",
};

function fallbackFromRealmStatic(): CampusLocationRecord[] {
  return REALM_LOCATIONS.map((loc, index) => ({
    id: loc.id,
    slug: loc.id,
    name: loc.name,
    description: loc.flavorText,
    category: "landmark",
    latitude: REALM_LOCATION_GEO[loc.id]?.latitude ?? null,
    longitude: REALM_LOCATION_GEO[loc.id]?.longitude ?? null,
    mapX: loc.x,
    mapY: loc.y,
    markerEmoji: loc.markerEmoji,
    shortLabel: loc.shortLabel,
    fantasyName: loc.fantasyName,
    flavorText: loc.flavorText,
    major: loc.major,
    legacyCampusKey: LEGACY_CAMPUS_KEY_BY_SLUG[loc.id] ?? null,
    sortOrder: index,
    isBuiltin: true,
    isActive: true,
  }));
}

export const FALLBACK_CAMPUS_LOCATIONS: CampusLocationRecord[] = fallbackFromRealmStatic();

let catalogCache: CampusLocationRecord[] | null = null;
let catalogCacheAt = 0;
const CATALOG_TTL_MS = 30_000;

export function clearCampusLocationCatalogCache(): void {
  catalogCache = null;
  catalogCacheAt = 0;
}

export function setCampusLocationCatalogCache(rows: CampusLocationRecord[]): void {
  catalogCache = rows;
  catalogCacheAt = Date.now();
}

export function getCampusLocationCatalogSnapshot(): CampusLocationRecord[] {
  if (catalogCache && Date.now() - catalogCacheAt < CATALOG_TTL_MS) {
    return catalogCache;
  }
  return FALLBACK_CAMPUS_LOCATIONS;
}

function registryEntryFromRecord(row: CampusLocationRecord): CampusLocationRegistryEntry {
  return { ...row, id: row.slug };
}

export function listCampusLocationRegistryEntries(includeInactive = false): CampusLocationRegistryEntry[] {
  const rows = getCampusLocationCatalogSnapshot().filter((row) => includeInactive || row.isActive);
  return rows.map(registryEntryFromRecord);
}

export function getCampusLocationIds(): CampusLocationId[] {
  return listCampusLocationRegistryEntries().map((e) => e.slug);
}

export function isCampusLocationId(value: string | null | undefined): value is CampusLocationId {
  if (!value) return false;
  return listCampusLocationRegistryEntries(true).some((e) => e.slug === value);
}

export function getCampusLocation(id: CampusLocationId): CampusLocationRegistryEntry {
  const entry = listCampusLocationRegistryEntries(true).find((e) => e.slug === id);
  if (!entry) throw new Error(`Unknown campus location id: ${id}`);
  return entry;
}

export function getCampusLocationName(id: CampusLocationId): string {
  const entry = listCampusLocationRegistryEntries(true).find((e) => e.slug === id);
  return entry?.name ?? id.replace(/-/g, " ");
}

export function campusLocationIdFromLegacyKey(key: string | null | undefined): CampusLocationId | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (isCampusLocationId(trimmed)) return trimmed;
  const fromStatic = ID_BY_LEGACY_CAMPUS_KEY[trimmed as CampusLocationKey];
  if (fromStatic) return fromStatic;
  const fromCatalog = listCampusLocationRegistryEntries(true).find((e) => e.legacyCampusKey === trimmed);
  return fromCatalog?.slug ?? null;
}

export function legacyCampusKeyFromLocationId(id: CampusLocationId): CampusLocationKey | null {
  const entry = listCampusLocationRegistryEntries(true).find((e) => e.slug === id);
  return entry?.legacyCampusKey ?? null;
}

/** Dropdown options for Add Memory — active locations, major first. */
export function getCampusMemoryLocationOptions(): { id: CampusLocationId; name: string; shortLabel: string }[] {
  return listCampusLocationRegistryEntries()
    .filter((e) => e.major || e.slug !== "business-building")
    .map((e) => ({ id: e.slug, name: e.name, shortLabel: e.shortLabel }));
}

export function sortMemoryGroups<T extends { locationId: CampusLocationId; hasRecent: boolean; count: number }>(
  groups: T[],
): T[] {
  return [...groups].sort((a, b) => {
    if (a.hasRecent !== b.hasRecent) return a.hasRecent ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    const aOrder = getCampusLocation(a.locationId).sortOrder;
    const bOrder = getCampusLocation(b.locationId).sortOrder;
    return aOrder - bOrder;
  });
}

/** Build RealmLocation-shaped pins from the catalog snapshot. */
export function realmLocationsFromCatalog(): RealmLocation[] {
  return listCampusLocationRegistryEntries().map((row) => ({
    id: row.slug,
    name: row.name,
    fantasyName: row.fantasyName || row.name,
    flavorText: row.flavorText || row.description,
    markerEmoji: row.markerEmoji,
    shortLabel: row.shortLabel || row.name,
    major: row.major,
    x: row.mapX ?? 50,
    y: row.mapY ?? 50,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  }));
}
