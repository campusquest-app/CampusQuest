/**
 * Single authoritative device-location type for Realm proximity / ETA.
 * Campus defaults, map center, session camera, and marker coords must never
 * be represented as a ValidUserLocation.
 */

export type ValidUserLocation = {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestamp: number;
  source: "device";
};

/** Discard GPS older than this — previous-session / stale watch fixes are not "current". */
export const USER_LOCATION_MAX_AGE_MS = 90_000;

/** Coarse/city-level accuracy must not produce walking ETAs. */
export const USER_LOCATION_MAX_ACCURACY_METERS = 250;

export function isUsableCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function isValidUserLocation(
  value: unknown,
  nowMs: number = Date.now(),
): value is ValidUserLocation {
  if (!value || typeof value !== "object") return false;
  const loc = value as Partial<ValidUserLocation>;
  if (loc.source !== "device") return false;
  if (!isUsableCoordinate(loc.lat, loc.lng)) return false;
  if (typeof loc.accuracyMeters !== "number" || !Number.isFinite(loc.accuracyMeters)) return false;
  if (loc.accuracyMeters <= 0 || loc.accuracyMeters > USER_LOCATION_MAX_ACCURACY_METERS) return false;
  if (typeof loc.timestamp !== "number" || !Number.isFinite(loc.timestamp)) return false;
  const age = nowMs - loc.timestamp;
  if (age > USER_LOCATION_MAX_AGE_MS || age < -5_000) return false;
  return true;
}

export function validUserLocationFromGeolocation(
  position: GeolocationPosition,
  nowMs: number = Date.now(),
): ValidUserLocation | null {
  const candidate: ValidUserLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    timestamp: position.timestamp || nowMs,
    source: "device",
  };
  return isValidUserLocation(candidate, nowMs) ? candidate : null;
}

export function validUserLocationFromFix(
  fix: {
    lat: number;
    lng: number;
    accuracy?: number | null;
    timestamp?: number;
  } | null,
  nowMs: number = Date.now(),
): ValidUserLocation | null {
  if (!fix) return null;
  if (fix.accuracy == null || !Number.isFinite(fix.accuracy)) return null;
  const candidate: ValidUserLocation = {
    lat: fix.lat,
    lng: fix.lng,
    accuracyMeters: fix.accuracy,
    timestamp: fix.timestamp ?? nowMs,
    source: "device",
  };
  return isValidUserLocation(candidate, nowMs) ? candidate : null;
}
