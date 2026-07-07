/** URI Kingston campus — roadmap defaults for The Realm. */
export const URI_MAP_CENTER = { lat: 41.4862, lng: -71.5309 } as const;

/** Zoom band where campus buildings read clearly in 3D (17–19). */
export const URI_MAP_DEFAULT_ZOOM = 18;

export const URI_MAP_MIN_ZOOM = 14;
export const URI_MAP_MAX_ZOOM = 20;

/** Cinematic tilt for raised buildings — max supported on vector roadmap is 67.5°. */
export const URI_MAP_CINEMATIC_TILT = 67.5;

export const URI_MAP_ROTATE_STEP_DEG = 15;

/** Standard roadmap keeps building and POI labels visible. */
export const URI_MAP_TYPE_ID = "roadmap" as const;

/** Reset any tilt/rotation so the map stays flat and north-up. */
export function resetFlatMapOrientation(map: google.maps.Map): void {
  map.setTilt(0);
  map.setHeading(0);
}

/** Apply the default cinematic campus camera (vector maps with 3D buildings). */
export function applyCinematicCampusCamera(map: google.maps.Map): void {
  map.setHeading(0);
  if ((map.getZoom() ?? 0) < 16) {
    map.setZoom(URI_MAP_DEFAULT_ZOOM);
  }
  map.setTilt(URI_MAP_CINEMATIC_TILT);
}

/** Pan to campus center, restore zoom, and pick flat vs cinematic tilt. */
export function resetRealmMapCamera(
  map: google.maps.Map,
  mapLayer: "campus" | "satellite",
  vector3dEnabled: boolean,
): void {
  map.panTo(URI_MAP_CENTER);
  map.setZoom(URI_MAP_DEFAULT_ZOOM);
  map.setHeading(0);
  if (mapLayer === "campus" && vector3dEnabled) {
    applyCinematicCampusCamera(map);
  } else {
    map.setTilt(0);
  }
}

/** Rotate heading by a delta, wrapping 0–360. */
export function rotateMapHeading(map: google.maps.Map, deltaDegrees: number): void {
  const current = map.getHeading() ?? 0;
  const next = ((current + deltaDegrees) % 360 + 360) % 360;
  map.setHeading(next);
}

/**
 * Attempt to set tilt; returns whether the map accepted the target angle.
 * Some mobile browsers (e.g. Safari) may keep tilt at 0 — callers should fall back gracefully.
 */
export function trySetMapTilt(map: google.maps.Map, targetTilt: number): boolean {
  try {
    map.setTilt(targetTilt);
    const actual = map.getTilt() ?? 0;
    if (targetTilt === 0) return true;
    return actual >= targetTilt - 2;
  } catch {
    return false;
  }
}
