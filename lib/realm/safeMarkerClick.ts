/**
 * Safe Realm marker-click helpers: validate IDs, debounce rapid taps, and
 * log structured failures without throwing into AppErrorBoundary.
 */

import type { GroupedMapLocation } from "@/lib/mapLocationGroups";

export type RealmMarkerKind = "landmark" | "event" | "quest" | "memory" | "qr" | "supplementary" | "custom";

export type MarkerClickFailure = {
  markerType: RealmMarkerKind;
  markerId: string;
  source: string;
  lookupResult: "missing" | "invalid_id" | "null_coords" | "stale" | "deleted" | "duplicate" | "error" | "syncing";
  exception?: unknown;
};

const MARKER_UNAVAILABLE_MESSAGE = "This location is temporarily unavailable.";

export function getMarkerUnavailableMessage(): string {
  return MARKER_UNAVAILABLE_MESSAGE;
}

export function isValidMarkerId(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0 && id.length < 200;
}

export function inferMarkerKindFromGroup(group: GroupedMapLocation | null | undefined): RealmMarkerKind {
  if (!group) return "supplementary";
  if ((group.quests?.length ?? 0) > 0) return "quest";
  if ((group.qrCodes?.length ?? 0) > 0) return "qr";
  if ((group.events?.length ?? 0) > 0) return "event";
  if (group.attachToLandmark) return "landmark";
  return "supplementary";
}

export function logFailedMarkerClick(failure: MarkerClickFailure): void {
  const err =
    failure.exception instanceof Error
      ? failure.exception
      : new Error(
          `marker_click_failed:${failure.lookupResult}:${failure.markerType}:${failure.markerId}`,
        );
  const payload = {
    markerType: failure.markerType,
    markerId: failure.markerId,
    source: failure.source,
    lookupResult: failure.lookupResult,
    exception:
      failure.exception instanceof Error
        ? {
            name: failure.exception.name,
            message: failure.exception.message,
            stack: failure.exception.stack,
          }
        : failure.exception ?? null,
    stack: err.stack,
  };
  console.warn("[cq:realm-marker-click] failed", payload);
  // Lazy-load so unit tests don't pull the Supabase client graph.
  void import("@/lib/errorLogger")
    .then(({ logError }) => {
      logError(err, { component: "RealmMarkerClick", meta: payload });
    })
    .catch(() => {
      /* logging best-effort */
    });
}

/** Debounce rapid repeated taps on the same marker (double-tap safety). */
export function createMarkerTapGate(cooldownMs = 400) {
  let lastKey = "";
  let lastAt = 0;
  return {
    /** Returns true when the tap should proceed. */
    tryOpen(markerId: string, now = Date.now()): boolean {
      if (!isValidMarkerId(markerId)) return false;
      if (markerId === lastKey && now - lastAt < cooldownMs) return false;
      lastKey = markerId;
      lastAt = now;
      return true;
    },
    reset(): void {
      lastKey = "";
      lastAt = 0;
    },
  };
}

export type SafeOpenLandmarkResult =
  | { ok: true; id: string }
  | { ok: false; reason: MarkerClickFailure["lookupResult"]; message: string };

export function resolveLandmarkTap(args: {
  markerId: unknown;
  locations: Array<{ id: string }>;
  source?: string;
}): SafeOpenLandmarkResult {
  if (!isValidMarkerId(args.markerId)) {
    logFailedMarkerClick({
      markerType: "landmark",
      markerId: String(args.markerId ?? ""),
      source: args.source ?? "realm_map",
      lookupResult: "invalid_id",
    });
    return { ok: false, reason: "invalid_id", message: MARKER_UNAVAILABLE_MESSAGE };
  }
  const found = args.locations.find((l) => l.id === args.markerId);
  if (!found) {
    logFailedMarkerClick({
      markerType: "landmark",
      markerId: args.markerId,
      source: args.source ?? "realm_map",
      lookupResult: "missing",
    });
    return { ok: false, reason: "missing", message: MARKER_UNAVAILABLE_MESSAGE };
  }
  return { ok: true, id: found.id };
}

export function resolveSupplementaryTap(args: {
  group: GroupedMapLocation | null | undefined;
  source?: string;
}): SafeOpenLandmarkResult {
  if (!args.group || !isValidMarkerId(args.group.groupKey)) {
    logFailedMarkerClick({
      markerType: "supplementary",
      markerId: String(args.group?.groupKey ?? ""),
      source: args.source ?? "realm_map",
      lookupResult: "invalid_id",
    });
    return { ok: false, reason: "invalid_id", message: MARKER_UNAVAILABLE_MESSAGE };
  }

  const lat = args.group.lat;
  const lng = args.group.lng;
  const hasPercent =
    typeof args.group.x === "number" &&
    typeof args.group.y === "number" &&
    Number.isFinite(args.group.x) &&
    Number.isFinite(args.group.y);
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  if (!hasCoords && !hasPercent && !args.group.attachToLandmark) {
    logFailedMarkerClick({
      markerType: inferMarkerKindFromGroup(args.group),
      markerId: args.group.groupKey,
      source: args.source ?? "realm_map",
      lookupResult: "null_coords",
    });
    return { ok: false, reason: "null_coords", message: MARKER_UNAVAILABLE_MESSAGE };
  }

  return { ok: true, id: args.group.groupKey };
}

/** Normalize map content arrays so sheet render never crashes on undefined lists. */
export function normalizeGroupedMapContent(
  group: GroupedMapLocation | null | undefined,
): GroupedMapLocation | null {
  if (!group) return null;
  return {
    ...group,
    quests: Array.isArray(group.quests) ? group.quests : [],
    events: Array.isArray(group.events) ? group.events : [],
    qrCodes: Array.isArray(group.qrCodes) ? group.qrCodes : [],
  };
}
