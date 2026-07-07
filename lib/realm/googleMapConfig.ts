/**
 * Google Maps vector Map ID for The Realm.
 *
 * Raised 3D buildings and programmatic tilt require a **vector** map rendered
 * with a Cloud Map ID (`NEXT_PUBLIC_GOOGLE_MAP_ID`). Raster-only maps stay flat.
 *
 * Configure the Map ID in Google Cloud Console → Map Management, associate your
 * CQ dark styling there (inline `styles` are ignored when `mapId` is set).
 *
 * @see https://developers.google.com/maps/documentation/javascript/3d-maps
 */
export const REALM_GOOGLE_MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "").trim();

/** True when a vector Map ID is configured for 3D building extrusion. */
export function isRealmVector3dEnabled(): boolean {
  return REALM_GOOGLE_MAP_ID.length > 0;
}
