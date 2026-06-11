import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { footprintByLocationId } from "@/lib/realm/mapGeometry";
import type { RealmLocationId } from "@/lib/realm/locations";

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

export function mapPositionForExternalEvent(args: {
  latitude: number | null;
  longitude: number | null;
  realmLocationId?: RealmLocationId | null;
}): { x: number; y: number } | null {
  if (args.realmLocationId) {
    const footprint = footprintByLocationId(args.realmLocationId);
    if (footprint) return { x: footprint.cx, y: footprint.cy };
  }
  if (args.latitude == null || args.longitude == null) return null;
  return geoToRealmMapPercent(args.latitude, args.longitude);
}
