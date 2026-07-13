import type { RealmDirectionsSummary, RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";
import { ROUTE_CACHE_TTL_MS, routeCacheKey } from "@/lib/realm/routeRequestConstants";

export type CachedRouteResult = {
  summary: RealmDirectionsSummary;
  path: Array<{ lat: number; lng: number }>;
  approximate: boolean;
  cachedAt: number;
};

const routeCache = new Map<string, CachedRouteResult>();

export function readCachedRoute(args: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode: RealmTravelMode;
}): CachedRouteResult | null {
  const key = routeCacheKey({
    travelMode: args.travelMode,
    originLat: args.origin.lat,
    originLng: args.origin.lng,
    destLat: args.destination.lat,
    destLng: args.destination.lng,
  });
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return hit;
}

export function writeCachedRoute(args: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode: RealmTravelMode;
  result: Omit<CachedRouteResult, "cachedAt">;
}): void {
  const key = routeCacheKey({
    travelMode: args.travelMode,
    originLat: args.origin.lat,
    originLng: args.origin.lng,
    destLat: args.destination.lat,
    destLng: args.destination.lng,
  });
  routeCache.set(key, { ...args.result, cachedAt: Date.now() });
}

export function clearRouteCache(): void {
  routeCache.clear();
}
