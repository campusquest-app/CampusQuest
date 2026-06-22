import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { footprintByLocationId } from "@/lib/realm/mapGeometry";
import { geoToRealmMapPercent } from "@/lib/realm/geoToMapPercent";
import type { RealmLocationId } from "@/lib/realm/locations";

export { geoToRealmMapPercent } from "@/lib/realm/geoToMapPercent";

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
