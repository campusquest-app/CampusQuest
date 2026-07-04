/** URI Kingston campus — flat roadmap defaults for The Realm. */
export const URI_MAP_CENTER = { lat: 41.4862, lng: -71.5309 } as const;
export const URI_MAP_DEFAULT_ZOOM = 17;
export const URI_MAP_MIN_ZOOM = 14;
export const URI_MAP_MAX_ZOOM = 20;

/** Standard roadmap keeps building and POI labels visible. */
export const URI_MAP_TYPE_ID = "roadmap" as const;

/** Reset any tilt/rotation so the map stays flat and north-up. */
export function resetFlatMapOrientation(map: google.maps.Map): void {
  map.setTilt(0);
  map.setHeading(0);
}
