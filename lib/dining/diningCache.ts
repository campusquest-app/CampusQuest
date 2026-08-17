import type { DiningMenu } from "./types";

type CacheEntry = {
  menu: DiningMenu;
  expiresAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  __cqDiningMenuCache?: Map<string, CacheEntry>;
};

function store(): Map<string, CacheEntry> {
  if (!globalStore.__cqDiningMenuCache) {
    globalStore.__cqDiningMenuCache = new Map();
  }
  return globalStore.__cqDiningMenuCache;
}

export function diningCacheKey(locationId: string, isoDate: string): string {
  return `${locationId}:${isoDate}`;
}

export function getCachedDiningMenu(locationId: string, isoDate: string): DiningMenu | null {
  const entry = store().get(diningCacheKey(locationId, isoDate));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    // Keep expired entry for stale fallback; caller decides.
    return { ...entry.menu, stale: true, source: "cache" };
  }
  return { ...entry.menu, source: "cache" };
}

export function getFreshCachedDiningMenu(
  locationId: string,
  isoDate: string,
): DiningMenu | null {
  const entry = store().get(diningCacheKey(locationId, isoDate));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return { ...entry.menu, source: "cache" };
}

export function setCachedDiningMenu(
  menu: DiningMenu,
  ttlMs: number,
): void {
  store().set(diningCacheKey(menu.location.id, menu.date), {
    menu: { ...menu, stale: false, source: "netnutrition" },
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearDiningMenuCache(): void {
  store().clear();
}

export function todayMenuTtlMs(): number {
  return 20 * 60 * 1000; // 20 minutes
}

export function upcomingMenuTtlMs(): number {
  return 6 * 60 * 60 * 1000; // 6 hours
}
