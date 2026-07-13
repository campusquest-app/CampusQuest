import { DESTINATION_COORD_CACHE_TTL_MS } from "@/lib/realm/routeRequestConstants";

type CachedDestinationCoords = {
  lat: number;
  lng: number;
  cachedAt: number;
};

const memoryCache = new Map<string, CachedDestinationCoords>();
const STORAGE_KEY = "cq:route-destination-coords";

function readStorage(): Record<string, CachedDestinationCoords> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedDestinationCoords>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(map: Record<string, CachedDestinationCoords>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* non-blocking */
  }
}

function cacheKey(destinationId: string | undefined, destinationName: string): string {
  const id = destinationId?.trim();
  if (id) return `id:${id}`;
  return `name:${destinationName.trim().toLowerCase()}`;
}

export function readCachedDestinationCoords(
  destinationId: string | undefined,
  destinationName: string,
): { lat: number; lng: number } | null {
  const key = cacheKey(destinationId, destinationName);
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.cachedAt < DESTINATION_COORD_CACHE_TTL_MS) {
    return { lat: mem.lat, lng: mem.lng };
  }

  const stored = readStorage()[key];
  if (stored && Date.now() - stored.cachedAt < DESTINATION_COORD_CACHE_TTL_MS) {
    memoryCache.set(key, stored);
    return { lat: stored.lat, lng: stored.lng };
  }
  return null;
}

export function writeCachedDestinationCoords(args: {
  destinationId?: string;
  destinationName: string;
  lat: number;
  lng: number;
}): void {
  const key = cacheKey(args.destinationId, args.destinationName);
  const row = { lat: args.lat, lng: args.lng, cachedAt: Date.now() };
  memoryCache.set(key, row);
  const stored = readStorage();
  stored[key] = row;
  writeStorage(stored);
}
