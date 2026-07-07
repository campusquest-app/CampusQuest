import { URI_MAP_CENTER } from "@/lib/realm/googleMapPose";
import type { RealmDirectionsOrigin } from "@/lib/realm/realmDirectionsTypes";

export const REALM_DIRECTIONS_FALLBACK_ORIGIN = {
  lat: URI_MAP_CENTER.lat,
  lng: URI_MAP_CENTER.lng,
  label: "The Quad",
} as const;

const FALLBACK_HINT =
  "Location access denied — directions start from The Quad. Enable location for routes from where you are.";

export function resolveDirectionsOriginSync(): RealmDirectionsOrigin {
  return {
    ...REALM_DIRECTIONS_FALLBACK_ORIGIN,
    usedFallback: true,
    hint: FALLBACK_HINT,
  };
}

export async function resolveDirectionsOrigin(): Promise<RealmDirectionsOrigin> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return resolveDirectionsOriginSync();
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 45_000,
      });
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      label: "Your location",
      usedFallback: false,
      hint: null,
    };
  } catch {
    return resolveDirectionsOriginSync();
  }
}
