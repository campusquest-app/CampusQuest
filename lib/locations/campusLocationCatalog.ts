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
  "dining-hall": "dining_hall",
  library: "library",
  "memorial-union": "memorial_union",
  "rec-center": "mackal_rec_center",
  "engineering-hall": "academic_building",
};

const ID_BY_LEGACY_CAMPUS_KEY: Partial<Record<CampusLocationKey, string>> = {
  quad: "the-quad",
  library: "library",
  memorial_union: "memorial-union",
  mackal_rec_center: "rec-center",
  academic_building: "engineering-hall",
  dining_hall: "dining-hall",
  ryan_center: "rams-den",
};

function fallbackFromRealmStatic(): CampusLocationRecord[] {
  return REALM_LOCATIONS.map((loc, index) => ({
    id: loc.id,
    slug: loc.id,
    name: loc.name,
    description: `${loc.name} campus location.`,
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

/**
 * Returns the best available catalog. Once a fetch has populated `catalogCache`,
 * we keep serving it even after TTL (stale-while-revalidate) so custom/admin
 * location slugs never disappear mid-session and crash marker sheets.
 */
export function getCampusLocationCatalogSnapshot(): CampusLocationRecord[] {
  if (catalogCache && catalogCache.length > 0) {
    return catalogCache;
  }
  return FALLBACK_CAMPUS_LOCATIONS;
}

/** True when cache is empty or older than TTL — callers should refetch, not drop rows. */
export function isCampusLocationCatalogStale(): boolean {
  if (!catalogCache || catalogCache.length === 0) return true;
  return Date.now() - catalogCacheAt >= CATALOG_TTL_MS;
}

/** Synthetic entry so UI never throws on unknown / temporarily missing slugs. */
export function synthesizeCampusLocation(id: CampusLocationId): CampusLocationRegistryEntry {
  const label = id
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || "Campus location";
  return {
    id,
    slug: id,
    name: label,
    description: "",
    category: "landmark",
    latitude: null,
    longitude: null,
    mapX: 50,
    mapY: 50,
    markerEmoji: "📍",
    shortLabel: label,
    fantasyName: label,
    flavorText: "",
    major: false,
    legacyCampusKey: null,
    sortOrder: 9999,
    isBuiltin: false,
    isActive: true,
  };
}

export function tryGetCampusLocation(id: CampusLocationId | null | undefined): CampusLocationRegistryEntry | null {
  if (!id || typeof id !== "string" || !id.trim()) return null;
  return listCampusLocationRegistryEntries(true).find((e) => e.slug === id) ?? null;
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

/**
 * Resolve a campus location for UI. Never throws — unknown IDs get a synthetic
 * fallback so marker taps cannot take down the Realm via AppErrorBoundary.
 */
export function getCampusLocation(id: CampusLocationId): CampusLocationRegistryEntry {
  return tryGetCampusLocation(id) ?? synthesizeCampusLocation(id);
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
    description: row.description,
    category: row.category,
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
