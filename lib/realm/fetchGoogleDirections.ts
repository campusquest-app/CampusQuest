import { ROUTE_REQUEST_TIMEOUT_MS } from "@/lib/realm/routeRequestConstants";
import type { RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";

export async function fetchGoogleDirections(args: {
  service: google.maps.DirectionsService;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode: RealmTravelMode;
  signal?: AbortSignal;
}): Promise<{ result: google.maps.DirectionsResult; status: google.maps.DirectionsStatus }> {
  if (args.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("directions_timeout"));
    }, ROUTE_REQUEST_TIMEOUT_MS);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    args.signal?.addEventListener("abort", onAbort, { once: true });

    args.service.route(
      {
        origin: { lat: args.origin.lat, lng: args.origin.lng },
        destination: { lat: args.destination.lat, lng: args.destination.lng },
        travelMode:
          args.travelMode === "DRIVING"
            ? google.maps.TravelMode.DRIVING
            : args.travelMode === "BICYCLING"
              ? google.maps.TravelMode.BICYCLING
              : args.travelMode === "TRANSIT"
                ? google.maps.TravelMode.TRANSIT
                : google.maps.TravelMode.WALKING,
      },
      (result, status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        args.signal?.removeEventListener("abort", onAbort);
        if (!result) {
          reject(new Error(`directions_${status}`));
          return;
        }
        resolve({ result, status: status as google.maps.DirectionsStatus });
      },
    );
  });
}
