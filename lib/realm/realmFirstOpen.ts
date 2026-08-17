/**
 * First-open Realm experience: welcome card persistence + camera destination
 * resolution + a smooth zoom/pan fly-in (Google Maps has no native flyTo).
 */

import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import {
  URI_MAP_CENTER,
  URI_MAP_DEFAULT_ZOOM,
  moveMapCamera,
} from "@/lib/realm/googleMapPose";

export const REALM_WELCOME_STORAGE_KEY = "cq_realm_welcome_v1";

/** Heart of campus — Memorial Union / Quad midpoint for fallback centering. */
export const REALM_HEART_OF_CAMPUS = {
  lat: (REALM_LOCATION_GEO["memorial-union"].latitude + REALM_LOCATION_GEO["the-quad"].latitude) / 2,
  lng: (REALM_LOCATION_GEO["memorial-union"].longitude + REALM_LOCATION_GEO["the-quad"].longitude) / 2,
} as const;

/** Start zoomed out, then ease into this final discovery zoom. */
export const REALM_FIRST_OPEN_START_ZOOM = 15.1;
export const REALM_FIRST_OPEN_END_ZOOM = Math.min(URI_MAP_DEFAULT_ZOOM, 16.5);

export const REALM_FIRST_OPEN_FLY_MS = 1000;
export const REALM_LOCATE_TIMEOUT_MS = 2200;

export type RealmQuickActionId = "live" | "popular" | "closest-quest" | "study" | "buildings";

export const REALM_QUICK_ACTIONS: { id: RealmQuickActionId; label: string }[] = [
  { id: "live", label: "Live Now" },
  { id: "popular", label: "Popular" },
  { id: "closest-quest", label: "Closest Quest" },
  { id: "study", label: "Study" },
  { id: "buildings", label: "Buildings" },
];

export function hasSeenRealmWelcome(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(REALM_WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markRealmWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REALM_WELCOME_STORAGE_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function resolveFirstOpenCameraTarget(
  userPos: { lat: number; lng: number } | null,
): { lat: number; lng: number; source: "user" | "campus-heart" } {
  if (
    userPos &&
    Number.isFinite(userPos.lat) &&
    Number.isFinite(userPos.lng) &&
    // Reject absurd fixes far from campus (rough Kingston bounding box).
    userPos.lat > 41.46 &&
    userPos.lat < 41.52 &&
    userPos.lng > -71.56 &&
    userPos.lng < -71.5
  ) {
    return { ...userPos, source: "user" };
  }
  return { ...REALM_HEART_OF_CAMPUS, source: "campus-heart" };
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Smooth camera fly: pan toward target while easing zoom from start → end
 * over ~800–1200ms. Falls back to instant move when reduced-motion is on.
 */
export function flyMapCamera(
  map: google.maps.Map,
  target: { lat: number; lng: number },
  opts?: {
    startZoom?: number;
    endZoom?: number;
    durationMs?: number;
    signal?: AbortSignal;
  },
): Promise<void> {
  const startZoom = opts?.startZoom ?? REALM_FIRST_OPEN_START_ZOOM;
  const endZoom = opts?.endZoom ?? REALM_FIRST_OPEN_END_ZOOM;
  const durationMs = opts?.durationMs ?? REALM_FIRST_OPEN_FLY_MS;
  const signal = opts?.signal;

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Preserve any live tilt/heading — never flatten the camera during fly-to.
  const heading = map.getHeading() ?? 0;
  const tilt = map.getTilt() ?? 0;

  if (reduced || durationMs <= 0) {
    moveMapCamera(map, { center: target, zoom: endZoom, heading, tilt });
    return Promise.resolve();
  }

  // Seed a slightly zoomed-out frame, then animate zoom while panTo runs.
  moveMapCamera(map, { center: target, zoom: startZoom, heading, tilt });
  map.panTo(target);

  return new Promise((resolve) => {
    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - started) / durationMs);
      const zoom = startZoom + (endZoom - startZoom) * easeOutCubic(t);
      map.setZoom(zoom);
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        moveMapCamera(map, {
          center: target,
          zoom: endZoom,
          heading: map.getHeading() ?? heading,
          tilt: map.getTilt() ?? tilt,
        });
        resolve();
      }
    };

    frame = window.requestAnimationFrame(tick);
    signal?.addEventListener(
      "abort",
      () => {
        window.cancelAnimationFrame(frame);
        resolve();
      },
      { once: true },
    );
  });
}

/** Haversine distance in meters — used to prioritize nearby marker reveal. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Score for discovery ordering: active content first, then proximity. */
export function discoveryPriorityScore(args: {
  hasEvents: boolean;
  hasQuests: boolean;
  hasMemories: boolean;
  major: boolean;
  distanceM: number;
}): number {
  let score = 0;
  if (args.hasEvents) score += 400;
  if (args.hasQuests) score += 300;
  if (args.hasMemories) score += 150;
  if (args.major) score += 80;
  // Closer = higher (cap at 2km).
  score += Math.max(0, 200 - args.distanceM / 10);
  return score;
}

export { URI_MAP_CENTER };
