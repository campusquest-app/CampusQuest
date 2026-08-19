"use client";

import type { DiningLocationId, DiningMenuResponse } from "@/lib/dining/types";
import { diningMenuRequestKey } from "@/lib/dining/diningMenuClientState";
import { DINING_MENU_CLIENT_TIMEOUT_MS } from "@/lib/dining/diningMenuClientState";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import { uriTodayIso } from "@/lib/dining/diningTime";

const IS_DEV = process.env.NODE_ENV !== "production";

type SessionEntry = {
  menu: DiningMenuResponse;
  storedAtMs: number;
};

const sessionCache = new Map<string, SessionEntry>();
const inflight = new Map<string, Promise<DiningMenuResponse>>();

/** Primary halls to warm after map idle. */
export const DINING_PREFETCH_LOCATION_IDS: DiningLocationId[] = ["butterfield", "mainfare"];

function logClient(payload: Record<string, unknown>) {
  if (!IS_DEV) return;
  console.info("[cq:dining-menu:client]", payload);
}

export function getDiningMenuSessionCache(
  locationId: string,
  isoDate: string,
): DiningMenuResponse | null {
  const entry = sessionCache.get(diningMenuRequestKey(locationId, isoDate));
  return entry?.menu ?? null;
}

export function setDiningMenuSessionCache(
  locationId: string,
  isoDate: string,
  menu: DiningMenuResponse,
): void {
  sessionCache.set(diningMenuRequestKey(locationId, isoDate), {
    menu,
    storedAtMs: Date.now(),
  });
}

export function clearDiningMenuSessionCache(): void {
  sessionCache.clear();
  inflight.clear();
}

export function hasDiningMenuSessionInflight(locationId: string, isoDate: string): boolean {
  return inflight.has(diningMenuRequestKey(locationId, isoDate));
}

/**
 * Deduped client fetch for a dining menu. Shares one in-flight Promise across
 * Strict Mode double-effects and concurrent callers.
 *
 * Caller `signal` only cancels *waiting* on the result — it does not abort the
 * shared upstream request (so remounts / date switches don't kill a warm).
 */
export async function fetchDiningMenuSession(args: {
  locationId: DiningLocationId | string;
  isoDate: string;
  signal?: AbortSignal;
  /** When true, still share inflight but do not skip network if only session cache exists. */
  forceNetwork?: boolean;
}): Promise<DiningMenuResponse> {
  const key = diningMenuRequestKey(args.locationId, args.isoDate);
  const path = `/api/dining/menu?${new URLSearchParams({
    location: args.locationId,
    date: args.isoDate,
  })}`;

  if (!args.forceNetwork) {
    const cached = sessionCache.get(key);
    if (cached) {
      logClient({ phase: "session_cache_hit", key, ageMs: Date.now() - cached.storedAtMs });
      return cached.menu;
    }
  }

  const existing = inflight.get(key);
  if (existing) {
    logClient({ phase: "inflight_dedupe", key });
    return raceWithAbort(existing, args.signal);
  }

  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  logClient({ phase: "network_start", key, path });

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), DINING_MENU_CLIENT_TIMEOUT_MS);

  let promise!: Promise<DiningMenuResponse>;
  promise = (async () => {
    try {
      const data = await fetchAuthed<DiningMenuResponse>(path, {
        signal: timeoutController.signal,
      });
      setDiningMenuSessionCache(args.locationId, args.isoDate, data);
      const durationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
      );
      logClient({
        phase: "network_success",
        key,
        durationMs,
        stale: Boolean(data.stale),
        mealPeriods: data.mealPeriods.length,
      });
      return data;
    } catch (error) {
      const durationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
      );
      logClient({
        phase: "network_error",
        key,
        durationMs,
        message: error instanceof Error ? error.message : "error",
      });
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (inflight.get(key) === promise) inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return raceWithAbort(promise, args.signal);
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(
      typeof DOMException !== "undefined"
        ? new DOMException("Aborted", "AbortError")
        : Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(
        typeof DOMException !== "undefined"
          ? new DOMException("Aborted", "AbortError")
          : Object.assign(new Error("Aborted"), { name: "AbortError" }),
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

let prefetchScheduled = false;
let prefetchDoneForDate: string | null = null;

/**
 * Low-priority warm of today's menus for primary dining halls.
 * Safe to call repeatedly; only runs once per calendar day per page session.
 */
export function scheduleDiningMenuPrefetch(opts?: { delayMs?: number }): void {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;
  const today = uriTodayIso();
  if (prefetchDoneForDate === today || prefetchScheduled) return;
  prefetchScheduled = true;
  const delayMs = opts?.delayMs ?? 2_500;

  const run = () => {
    void (async () => {
      try {
        if (!getAccessToken()) return;
        logClient({ phase: "prefetch_start", date: today, locations: DINING_PREFETCH_LOCATION_IDS });
        await Promise.all(
          DINING_PREFETCH_LOCATION_IDS.map(async (locationId) => {
            if (getDiningMenuSessionCache(locationId, today)) return;
            if (hasDiningMenuSessionInflight(locationId, today)) return;
            try {
              await fetchDiningMenuSession({ locationId, isoDate: today });
            } catch {
              // Best-effort warm; ignore failures.
            }
          }),
        );
        prefetchDoneForDate = today;
        logClient({ phase: "prefetch_done", date: today });
      } finally {
        prefetchScheduled = false;
      }
    })();
  };

  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  window.setTimeout(() => {
    if (typeof ric === "function") {
      ric(run, { timeout: 4_000 });
    } else {
      run();
    }
  }, delayMs);
}
