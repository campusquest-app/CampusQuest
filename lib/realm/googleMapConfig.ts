/**
 * Google Maps vector Map ID for The Realm.
 *
 * Native tilt, two-finger rotate, and raised 3D buildings require a **vector**
 * map rendered with a Cloud Map ID. Without it, Google loads a raster map and
 * camera heading/tilt stay flat.
 *
 * Preferred env var (client-visible):
 *   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
 *
 * Legacy alias still accepted:
 *   NEXT_PUBLIC_GOOGLE_MAP_ID
 *
 * Configure the Map ID in Google Cloud Console → Map Management, associate your
 * CQ dark styling there (inline `styles` are ignored when `mapId` is set).
 *
 * Deploy note: the same `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` must also be set in the
 * Vercel project (Production + Preview) and the app redeployed so the client
 * bundle picks it up — env vars are inlined at build time.
 *
 * @see https://developers.google.com/maps/documentation/javascript/3d-maps
 */

function readPublicMapId(): string {
  const preferred = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "").trim();
  if (preferred) return preferred;
  // Legacy CampusQuest name — keep working until env is migrated.
  return (process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "").trim();
}

/** Cloud Console Map ID passed to `google.maps.Map` as `mapId`. */
export const REALM_GOOGLE_MAP_ID = readPublicMapId();

/** True when a vector Map ID is configured for tilt / 3D building extrusion. */
export function isRealmVector3dEnabled(): boolean {
  return REALM_GOOGLE_MAP_ID.length > 0;
}

/** Dev-only: warn once when the Map ID env var is missing (never logs the value). */
let missingMapIdWarned = false;

export function warnIfRealmMapIdMissing(): void {
  if (process.env.NODE_ENV !== "development") return;
  if (REALM_GOOGLE_MAP_ID || missingMapIdWarned) return;
  missingMapIdWarned = true;
  console.warn(
    "[cq:realm-map] NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID is missing. " +
      "The map will load as raster — native tilt, rotation, and 3D buildings will not work. " +
      "Create a vector Map ID in Google Cloud Console → Map Management, set the env var " +
      "(and on Vercel), then rebuild/redeploy.",
  );
}
