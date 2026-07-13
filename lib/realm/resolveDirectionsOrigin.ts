import type { RealmDirectionsOrigin } from "@/lib/realm/realmDirectionsTypes";

/**
 * Live GPS fix for the route origin. Never returns cached or fallback
 * coordinates — routes must start from the user's real position (the blue
 * marker), so callers surface an error when this returns null.
 */
export async function resolveLiveUserLocation(signal?: AbortSignal): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("geolocation_timeout")), 8_000);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      navigator.geolocation.getCurrentPosition(
        (value) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 8_000,
          maximumAge: 0,
        },
      );
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
