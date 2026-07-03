import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";

const GEO_VALUES = Object.values(REALM_LOCATION_GEO);
const MIN_LAT = Math.min(...GEO_VALUES.map((g) => g.latitude));
const MAX_LAT = Math.max(...GEO_VALUES.map((g) => g.latitude));
const MIN_LNG = Math.min(...GEO_VALUES.map((g) => g.longitude));
const MAX_LNG = Math.max(...GEO_VALUES.map((g) => g.longitude));

/** Convert campus lat/lng to Realm map percent coordinates. */
export function geoToRealmMapPercent(latitude: number, longitude: number): { x: number; y: number } {
  const lngSpan = MAX_LNG - MIN_LNG || 1;
  const latSpan = MAX_LAT - MIN_LAT || 1;
  const x = ((longitude - MIN_LNG) / lngSpan) * 100;
  const y = ((MAX_LAT - latitude) / latSpan) * 100;
  return {
    x: Math.min(96, Math.max(4, x)),
    y: Math.min(94, Math.max(6, y)),
  };
}

export function isValidCampusCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

/**
 * Inverse of {@link geoToRealmMapPercent} — approximate campus lat/lng for a
 * legacy percent-only map position. Lossy at the clamped edges; good enough to
 * place legacy percent pins on the real-world (Google) map layer.
 */
export function realmMapPercentToGeo(x: number, y: number): { latitude: number; longitude: number } {
  const lngSpan = MAX_LNG - MIN_LNG || 1;
  const latSpan = MAX_LAT - MIN_LAT || 1;
  return {
    longitude: MIN_LNG + (x / 100) * lngSpan,
    latitude: MAX_LAT - (y / 100) * latSpan,
  };
}
