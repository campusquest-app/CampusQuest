import type { RealmLocation, RealmLocationId } from "./locations";
import { REALM_LOCATIONS } from "./locations";

const STORAGE_KEY = "cq_realm_marker_positions_v1";
const SERVER_CACHE_KEY = "cq_realm_marker_positions_server_v1";

export type MarkerPosition = { x: number; y: number };

export type MarkerPositionMap = Partial<Record<RealmLocationId, MarkerPosition>>;

export type MarkerPositionsCacheMeta = {
  updatedAt: string | null;
  updatedBy: string | null;
};

export function loadMarkerPositionOverrides(): MarkerPositionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MarkerPositionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMarkerPositionOverrides(positions: MarkerPositionMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Quota / private mode
  }
}

export function loadServerMarkerPositionsCache(): { positions: MarkerPositionMap; meta: MarkerPositionsCacheMeta } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SERVER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { positions?: MarkerPositionMap; meta?: MarkerPositionsCacheMeta };
    if (!parsed?.positions || typeof parsed.positions !== "object") return null;
    return {
      positions: parsed.positions,
      meta: parsed.meta ?? { updatedAt: null, updatedBy: null },
    };
  } catch {
    return null;
  }
}

export function saveServerMarkerPositionsCache(positions: MarkerPositionMap, meta: MarkerPositionsCacheMeta): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SERVER_CACHE_KEY, JSON.stringify({ positions, meta }));
    saveMarkerPositionOverrides(positions);
  } catch {
    // Quota / private mode
  }
}

export function getDefaultMarkerPositions(): MarkerPositionMap {
  const out: MarkerPositionMap = {};
  for (const loc of REALM_LOCATIONS) {
    out[loc.id] = { x: loc.x, y: loc.y };
  }
  return out;
}

/** Merge catalog defaults with saved overrides (local or server). */
export function resolveMarkerPositions(overrides?: MarkerPositionMap): MarkerPositionMap {
  const base = getDefaultMarkerPositions();
  const saved = overrides ?? loadMarkerPositionOverrides();
  return { ...base, ...saved };
}

export function applyMarkerPositionsToLocations(
  locations: RealmLocation[],
  positions: MarkerPositionMap,
): RealmLocation[] {
  return locations.map((loc) => {
    const pos = positions[loc.id];
    if (!pos) return loc;
    return { ...loc, x: pos.x, y: pos.y };
  });
}

export function positionsFromLocations(locations: RealmLocation[]): MarkerPositionMap {
  const out: MarkerPositionMap = {};
  for (const loc of locations) {
    out[loc.id] = { x: loc.x, y: loc.y };
  }
  return out;
}
