import type { RealmDirectionsOrigin } from "@/lib/realm/realmDirectionsTypes";

/**
 * Live GPS fix for the route origin. Never returns cached or fallback
 * coordinates — routes must start from the user's real position (the blue
 * marker), so callers surface an error when this returns null.
 */
export async function resolveLiveUserLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      });
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch {
    return null;
  }
}

export function toDirectionsOrigin(point: { lat: number; lng: number }): RealmDirectionsOrigin {
  return {
    lat: point.lat,
    lng: point.lng,
    label: "Your location",
    usedFallback: false,
    hint: null,
  };
}
