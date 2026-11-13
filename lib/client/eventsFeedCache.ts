import type { CampusEventItem, ExternalFeedEventItem } from "@/lib/client/eventFeedTypes";

const TOKEN_KEY = "campusquest_access_token";
const STORAGE_PREFIX = "cq_events_feed_v1:";
/** Skip a new request when the student returns inside this window. */
export const EVENTS_FEED_FRESH_MS = 45_000;
/** Keep showing a saved feed while a refresh runs, then drop it. */
export const EVENTS_FEED_MAX_AGE_MS = 10 * 60_000;

export type EventsFeedSnapshot = {
  userId: string;
  events: CampusEventItem[];
  externalEvents: ExternalFeedEventItem[];
  savedAt: number;
};

let memory: EventsFeedSnapshot | null = null;

export function eventsFeedCacheIsFresh(savedAt: number, now = Date.now()): boolean {
  return now - savedAt >= 0 && now - savedAt < EVENTS_FEED_FRESH_MS;
}

export function eventsFeedCacheIsVisible(savedAt: number, now = Date.now()): boolean {
  return now - savedAt >= 0 && now - savedAt < EVENTS_FEED_MAX_AGE_MS;
}

function userIdFromAccessToken(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub : null;
  } catch {
    return null;
  }
}

export function currentEventsFeedUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    return token ? userIdFromAccessToken(token) : null;
  } catch {
    return null;
  }
}

export function readEventsFeedCache(userId: string, now = Date.now()): EventsFeedSnapshot | null {
  if (!userId) return null;
  if (memory && memory.userId === userId && eventsFeedCacheIsVisible(memory.savedAt, now)) {
    return memory;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EventsFeedSnapshot;
    if (!parsed || parsed.userId !== userId || !eventsFeedCacheIsVisible(parsed.savedAt, now)) {
      window.localStorage.removeItem(STORAGE_PREFIX + userId);
      return null;
    }
    if (!Array.isArray(parsed.events) || !Array.isArray(parsed.externalEvents)) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function writeEventsFeedCache(snapshot: EventsFeedSnapshot): void {
  if (!snapshot.userId) return;
  memory = snapshot;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + snapshot.userId, JSON.stringify(snapshot));
  } catch {
    // A full catalog can exceed the device quota. The in-memory copy still covers this visit.
  }
}

export function clearEventsFeedCache(): void {
  memory = null;
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures during logout.
  }
}
