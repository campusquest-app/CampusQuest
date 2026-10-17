/**
 * Best-effort Cache Storage priming for Quad feed posters / images.
 * Supported in Safari / WKWebView; silently no-ops when unavailable (private mode, etc.).
 */

const CACHE_NAME = "cq-quad-feed-media-v1";
const primed = new Set<string>();

export function canUseMediaCache(): boolean {
  return typeof caches !== "undefined" && typeof caches.open === "function";
}

/** Fire-and-forget: store a successful GET so repeat visits / scroll-backs hit disk cache. */
export function primeMediaCache(url: string | null | undefined): void {
  const href = typeof url === "string" ? url.trim() : "";
  if (!href || !/^https?:\/\//i.test(href)) return;
  if (!canUseMediaCache()) return;
  if (primed.has(href)) return;
  primed.add(href);
  void (async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const existing = await cache.match(href);
      if (existing) return;
      const response = await fetch(href, { mode: "cors", credentials: "omit", cache: "force-cache" });
      if (!response.ok) return;
      // Only cache opaque-safe image responses (skip huge videos).
      const type = response.headers.get("content-type") || "";
      if (type.startsWith("video/")) return;
      await cache.put(href, response.clone());
    } catch {
      primed.delete(href);
    }
  })();
}

export function resetMediaCachePrimedForTests(): void {
  primed.clear();
}
