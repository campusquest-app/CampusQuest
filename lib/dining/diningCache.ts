import type { DiningMenu } from "./types";

type CacheEntry = {
  menu: DiningMenu;
  expiresAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  __cqDiningMenuCache?: Map<string, CacheEntry>;
  __cqDiningMenuInflight?: Map<string, Promise<DiningMenu>>;
};

function store(): Map<string, CacheEntry> {
  if (!globalStore.__cqDiningMenuCache) {
    globalStore.__cqDiningMenuCache = new Map();
  }
  return globalStore.__cqDiningMenuCache;
}

function inflightStore(): Map<string, Promise<DiningMenu>> {
  if (!globalStore.__cqDiningMenuInflight) {
    globalStore.__cqDiningMenuInflight = new Map();
  }
  return globalStore.__cqDiningMenuInflight;
}

export function diningCacheKey(locationId: string, isoDate: string): string {
  return `${locationId}:${isoDate}`;
}

export type DiningCachePeek = {
  menu: DiningMenu;
  fresh: boolean;
  expiresAt: number;
  ageMs: number;
};

export function peekDiningMenuCache(locationId: string, isoDate: string): DiningCachePeek | null {
  const entry = store().get(diningCacheKey(locationId, isoDate));
  if (!entry) return null;
  const now = Date.now();
  return {
    menu: entry.menu,
    fresh: now <= entry.expiresAt,
    expiresAt: entry.expiresAt,
    ageMs: (() => {
      const parsed = Date.parse(entry.menu.fetchedAt || "");
      return Number.isFinite(parsed) ? Math.max(0, now - parsed) : 0;
    })(),
  };
}

export function getCachedDiningMenu(locationId: string, isoDate: string): DiningMenu | null {
  const peek = peekDiningMenuCache(locationId, isoDate);
  if (!peek) return null;
  if (!peek.fresh) {
    return { ...peek.menu, stale: true, source: "cache" };
  }
  return { ...peek.menu, stale: false, source: "cache" };
}

export function getFreshCachedDiningMenu(
  locationId: string,
  isoDate: string,
): DiningMenu | null {
  const peek = peekDiningMenuCache(locationId, isoDate);
  if (!peek?.fresh) return null;
  return { ...peek.menu, stale: false, source: "cache" };
}

export function setCachedDiningMenu(menu: DiningMenu, ttlMs: number): void {
  store().set(diningCacheKey(menu.location.id, menu.date), {
    menu: { ...menu, stale: false, source: "netnutrition" },
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearDiningMenuCache(): void {
  store().clear();
  inflightStore().clear();
}

/** Deduplicate concurrent NetNutrition fetches for the same location+date. */
export function getOrStartDiningMenuFetch(
  key: string,
  start: () => Promise<DiningMenu>,
): Promise<DiningMenu> {
  const inflight = inflightStore();
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = start().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export function hasDiningMenuInflight(key: string): boolean {
  return inflightStore().has(key);
}

/** Current-day menu freshness target (~10–30 min). */
export function todayMenuTtlMs(): number {
  return 20 * 60 * 1000;
}

/** Future-day menus change less often. */
export function upcomingMenuTtlMs(): number {
  return 6 * 60 * 60 * 1000;
}
