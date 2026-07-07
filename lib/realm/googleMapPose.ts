/** URI Kingston campus — roadmap defaults for The Realm. */
export const URI_MAP_CENTER = { lat: 41.4862, lng: -71.5309 } as const;

/** Zoom band where campus buildings read clearly in 3D (17–19). */
export const URI_MAP_DEFAULT_ZOOM = 18;

/** Minimum zoom when raising buildings / 3D campus view. */
export const URI_MAP_BUILDING_ZOOM = 18;

export const URI_MAP_MIN_ZOOM = 14;
export const URI_MAP_MAX_ZOOM = 20;

/** Cinematic tilt for raised buildings — max supported on vector roadmap is 67.5°. */
export const URI_MAP_CINEMATIC_TILT = 67.5;

/** Fallback tilt when 67.5° is rejected (some devices cap at 45°). */
export const URI_MAP_FALLBACK_TILT = 45;

export const URI_MAP_ROTATE_STEP_DEG = 15;

/** Standard roadmap keeps building and POI labels visible. */
export const URI_MAP_TYPE_ID = "roadmap" as const;

type CameraTarget = {
  center?: google.maps.LatLng | google.maps.LatLngLiteral | null;
  zoom?: number;
  tilt?: number;
  heading?: number;
};

/** Apply camera changes via moveCamera when available (smoother on vector maps). */
export function moveMapCamera(map: google.maps.Map, target: CameraTarget): void {
  const center = target.center ?? map.getCenter() ?? URI_MAP_CENTER;
  const zoom = target.zoom ?? map.getZoom() ?? URI_MAP_DEFAULT_ZOOM;
  const tilt = target.tilt ?? map.getTilt() ?? 0;
  const heading = target.heading ?? map.getHeading() ?? 0;

  if (typeof map.moveCamera === "function") {
    map.moveCamera({ center, zoom, tilt, heading });
    return;
  }

  if (center) map.panTo(center);
  map.setZoom(zoom);
  map.setTilt(tilt);
  map.setHeading(heading);
}

/** True when the map is rendering with the vector pipeline (required for native 3D). */
export function isVectorMapRendering(map: google.maps.Map): boolean {
  const renderingType = map.getRenderingType?.();
  if (renderingType == null) return false;
  const vector = google.maps.RenderingType?.VECTOR;
  return vector != null && renderingType === vector;
}

/** Reset any tilt/rotation so the map stays flat and north-up. */
export function resetFlatMapOrientation(map: google.maps.Map): void {
  moveMapCamera(map, { tilt: 0, heading: 0 });
}

/**
 * Apply cinematic campus camera (tilt + zoom for 3D buildings).
 * Returns the tilt angle the map accepted, or 0 if flat.
 */
export function applyCinematicCampusCamera(
  map: google.maps.Map,
  options?: { preserveCenter?: boolean; preserveHeading?: boolean },
): number {
  const center = options?.preserveCenter ? map.getCenter() : URI_MAP_CENTER;
  const heading = options?.preserveHeading ? (map.getHeading() ?? 0) : 0;
  const zoom = Math.max(map.getZoom() ?? 0, URI_MAP_BUILDING_ZOOM);

  moveMapCamera(map, {
    center: center ?? URI_MAP_CENTER,
    zoom,
    heading,
    tilt: URI_MAP_CINEMATIC_TILT,
  });

  const actual = map.getTilt() ?? 0;
  if (actual >= URI_MAP_FALLBACK_TILT - 2) return actual;

  moveMapCamera(map, {
    center: center ?? URI_MAP_CENTER,
    zoom,
    heading,
    tilt: URI_MAP_FALLBACK_TILT,
  });

  return map.getTilt() ?? 0;
}

/** Pan to campus center, restore zoom, and return to flat north-up view. */
export function resetRealmMapCamera(
  map: google.maps.Map,
  mapLayer: "campus" | "satellite",
  _vector3dEnabled: boolean,
): void {
  moveMapCamera(map, {
    center: URI_MAP_CENTER,
    zoom: URI_MAP_DEFAULT_ZOOM,
    heading: 0,
    tilt: 0,
  });
  if (mapLayer === "satellite") {
    map.setMapTypeId("satellite");
  }
}

/** Rotate heading by a delta, wrapping 0–360. */
export function rotateMapHeading(map: google.maps.Map, deltaDegrees: number): void {
  const current = map.getHeading() ?? 0;
  const next = ((current + deltaDegrees) % 360 + 360) % 360;
  moveMapCamera(map, { heading: next });
}

/** Smoothly reset heading to north-up. */
export function resetMapHeading(map: google.maps.Map): void {
  moveMapCamera(map, { heading: 0 });
}

/**
 * Attempt to set tilt; returns whether the map accepted the target angle.
 * Some mobile browsers (e.g. Safari) may keep tilt at 0 — callers should fall back gracefully.
 */
export function trySetMapTilt(map: google.maps.Map, targetTilt: number): boolean {
  try {
    moveMapCamera(map, { tilt: targetTilt });
    const actual = map.getTilt() ?? 0;
    if (targetTilt === 0) return true;
    return actual >= targetTilt - 2;
  } catch {
    return false;
  }
}

/** Read accepted tilt after a short delay (moveCamera can be async on Safari). */
export function readMapTiltAfterDelay(
  map: google.maps.Map,
  delayMs = 380,
): Promise<number> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(map.getTilt() ?? 0), delayMs);
  });
}
