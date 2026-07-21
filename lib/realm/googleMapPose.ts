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

/** Target tilt for the “3D view” control (within Google’s 0–67.5° range). */
export const URI_MAP_3D_VIEW_TILT = 60;

/** Zoom for the “3D view” control where extruded buildings read clearly. */
export const URI_MAP_3D_VIEW_ZOOM = 18.5;

/** Standard roadmap keeps building and POI labels visible. */
export const URI_MAP_TYPE_ID = "roadmap" as const;

const TILT_ACCEPT_EPSILON = 2;

type CameraTarget = {
  center?: google.maps.LatLng | google.maps.LatLngLiteral | null;
  zoom?: number;
  tilt?: number;
  heading?: number;
};

export function centerToLiteral(
  center: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined,
): google.maps.LatLngLiteral {
  if (!center) return URI_MAP_CENTER;
  if (typeof (center as google.maps.LatLng).lat === "function") {
    const latLng = center as google.maps.LatLng;
    return { lat: latLng.lat(), lng: latLng.lng() };
  }
  return center as google.maps.LatLngLiteral;
}

/** Normalize heading to an integer degrees value in `[0, 359]`. */
export function normalizeHeadingDegrees(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  return ((Math.round(heading) % 360) + 360) % 360;
}

/** Apply camera changes via moveCamera when available (smoother on vector maps). */
export function moveMapCamera(map: google.maps.Map, target: CameraTarget): void {
  const center = centerToLiteral(target.center ?? map.getCenter() ?? URI_MAP_CENTER);
  const zoom = target.zoom ?? map.getZoom() ?? URI_MAP_DEFAULT_ZOOM;
  const tilt = target.tilt ?? map.getTilt() ?? 0;
  const heading = normalizeHeadingDegrees(target.heading ?? map.getHeading() ?? 0);

  if (typeof map.moveCamera === "function") {
    map.moveCamera({ center, zoom, tilt, heading });
    return;
  }

  map.panTo(center);
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

/** Wait for map camera/tiles to settle after moveCamera (required on Safari). */
export function waitForMapIdle(map: google.maps.Map, timeoutMs = 2200): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      const listener = idleListener as google.maps.MapsEventListener & { remove?: () => void };
      if (typeof listener?.remove === "function") {
        listener.remove();
      } else if (typeof google !== "undefined" && google.maps?.event?.removeListener) {
        google.maps.event.removeListener(idleListener);
      }
      if (timer != null) clearTimeout(timer);
      resolve();
    };

    const idleListener = map.addListener("idle", finish);
    timer = setTimeout(finish, timeoutMs);
  });
}

/** Read accepted tilt after camera motion settles. */
export async function readMapTiltAfterDelay(
  map: google.maps.Map,
  delayMs = 120,
): Promise<number> {
  await waitForMapIdle(map);
  if (delayMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
  return map.getTilt() ?? 0;
}

/**
 * Apply cinematic campus camera (tilt + zoom for 3D buildings).
 * Waits for the map to accept the tilt before returning.
 */
export async function applyTiltCamera(
  map: google.maps.Map,
  options?: { preserveCenter?: boolean; preserveHeading?: boolean },
): Promise<number> {
  const center = options?.preserveCenter ? map.getCenter() : URI_MAP_CENTER;
  const heading = options?.preserveHeading ? (map.getHeading() ?? 0) : (map.getHeading() ?? 0);
  const zoom = Math.max(map.getZoom() ?? 0, URI_MAP_BUILDING_ZOOM);
  const centerLiteral = centerToLiteral(center);

  for (const targetTilt of [URI_MAP_CINEMATIC_TILT, URI_MAP_FALLBACK_TILT]) {
    moveMapCamera(map, {
      center: centerLiteral,
      zoom,
      heading,
      tilt: targetTilt,
    });
    const actual = await readMapTiltAfterDelay(map);
    if (actual >= URI_MAP_FALLBACK_TILT - TILT_ACCEPT_EPSILON) {
      return actual;
    }
  }

  return map.getTilt() ?? 0;
}

/** @deprecated Prefer applyTiltCamera — sync check is unreliable right after moveCamera. */
export function applyCinematicCampusCamera(
  map: google.maps.Map,
  options?: { preserveCenter?: boolean; preserveHeading?: boolean },
): number {
  const center = options?.preserveCenter ? map.getCenter() : URI_MAP_CENTER;
  const heading = options?.preserveHeading ? (map.getHeading() ?? 0) : 0;
  const zoom = Math.max(map.getZoom() ?? 0, URI_MAP_BUILDING_ZOOM);

  moveMapCamera(map, {
    center: centerToLiteral(center),
    zoom,
    heading,
    tilt: URI_MAP_CINEMATIC_TILT,
  });

  const actual = map.getTilt() ?? 0;
  if (actual >= URI_MAP_FALLBACK_TILT - TILT_ACCEPT_EPSILON) return actual;

  moveMapCamera(map, {
    center: centerToLiteral(center),
    zoom,
    heading,
    tilt: URI_MAP_FALLBACK_TILT,
  });

  return map.getTilt() ?? 0;
}

/** Animate back to flat while preserving center, zoom, and heading. */
export async function applyFlatCamera(map: google.maps.Map): Promise<void> {
  moveMapCamera(map, {
    center: centerToLiteral(map.getCenter()),
    zoom: map.getZoom() ?? URI_MAP_DEFAULT_ZOOM,
    heading: map.getHeading() ?? 0,
    tilt: 0,
  });
  await readMapTiltAfterDelay(map);
}

/**
 * Explicit 3D discovery pose: zoom in, tilt for perspective, keep heading.
 * Used by the 3D / buildings control so acceptance tests can verify real camera motion.
 */
export async function apply3dBuildingView(
  map: google.maps.Map,
  options?: { tilt?: number; zoom?: number },
): Promise<number> {
  const tilt = options?.tilt ?? URI_MAP_3D_VIEW_TILT;
  const zoom = Math.max(options?.zoom ?? URI_MAP_3D_VIEW_ZOOM, URI_MAP_BUILDING_ZOOM);
  const heading = map.getHeading() ?? 0;
  const center = centerToLiteral(map.getCenter());

  moveMapCamera(map, { center, zoom, heading, tilt });
  let actual = await readMapTiltAfterDelay(map);
  if (actual >= tilt - TILT_ACCEPT_EPSILON) return actual;

  // Fall back through supported tilt steps if 60° is rejected.
  for (const candidate of [URI_MAP_CINEMATIC_TILT, URI_MAP_FALLBACK_TILT, 45, 30]) {
    if (candidate > tilt) continue;
    moveMapCamera(map, { center, zoom, heading, tilt: candidate });
    actual = await readMapTiltAfterDelay(map);
    if (actual >= Math.min(candidate, URI_MAP_FALLBACK_TILT) - TILT_ACCEPT_EPSILON) {
      return actual;
    }
  }
  return map.getTilt() ?? 0;
}

/** Reset any tilt/rotation so the map stays flat and north-up. */
export function resetFlatMapOrientation(map: google.maps.Map): void {
  moveMapCamera(map, { tilt: 0, heading: 0 });
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

/** Rotate heading by a delta, wrapping 0–359. */
export function rotateMapHeading(map: google.maps.Map, deltaDegrees: number): void {
  const current = map.getHeading() ?? 0;
  const next = normalizeHeadingDegrees(current + deltaDegrees);
  if (typeof map.setHeading === "function") {
    map.setHeading(next);
  }
  moveMapCamera(map, { heading: next });
}

/** Smoothly reset heading to north-up. */
export function resetMapHeading(map: google.maps.Map): void {
  if (typeof map.setHeading === "function") {
    map.setHeading(0);
  }
  moveMapCamera(map, { heading: 0 });
}

/**
 * Attempt to set tilt; returns whether the map accepted the target angle.
 * Prefer applyTiltCamera for interactive toggles — moveCamera settles asynchronously.
 */
export function trySetMapTilt(map: google.maps.Map, targetTilt: number): boolean {
  try {
    moveMapCamera(map, { tilt: targetTilt });
    const actual = map.getTilt() ?? 0;
    if (targetTilt === 0) return true;
    return actual >= targetTilt - TILT_ACCEPT_EPSILON;
  } catch {
    return false;
  }
}

export function logRealmMapCameraDebug(
  map: google.maps.Map | null | undefined,
  detail: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "development" || !map) return;
  console.info("[cq:realm-map:camera]", {
    zoom: map.getZoom(),
    tilt: map.getTilt(),
    heading: map.getHeading(),
    renderingType: map.getRenderingType?.(),
    ...detail,
  });
}
