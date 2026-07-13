import { ROUTE_REQUEST_TIMEOUT_MS } from "@/lib/realm/routeRequestConstants";

function readValidCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { lat: number; lng: number } | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error(`${label}_timeout`));
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    promise
      .then((value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
}

/** Client-side geocode for map routing when marker coordinates are missing. */
export async function geocodeRouteDestination(args: {
  destinationName: string;
  signal?: AbortSignal;
}): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
  if (typeof google === "undefined" || !google.maps?.Geocoder) return null;
  const query = `${args.destinationName.trim()}, University of Rhode Island, Kingston, RI`;
  const geocoder = new google.maps.Geocoder();

  try {
    const response = await withTimeout(
      new Promise<google.maps.GeocoderResponse>((resolve, reject) => {
        geocoder.geocode({ address: query, region: "us" }, (results, status) => {
          if (status === google.maps.GeocoderStatus.OK && results?.length) {
            resolve({ results } as google.maps.GeocoderResponse);
            return;
          }
          reject(new Error(`geocode_${status}`));
        });
      }),
      ROUTE_REQUEST_TIMEOUT_MS,
      "geocode",
      args.signal,
    );

    const first = response.results?.[0];
    const location = first?.geometry?.location;
    if (!location) return null;
    const lat = location.lat();
    const lng = location.lng();
    const coords = readValidCoords(lat, lng);
    if (!coords) return null;
    return { ...coords, formattedAddress: first.formatted_address };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return null;
  }
}

export async function resolveRouteDestinationCoordinates(args: {
  destinationId?: string;
  destinationName: string;
  latitude?: number | null;
  longitude?: number | null;
  signal?: AbortSignal;
  readCache?: typeof import("@/lib/realm/destinationCoordinateCache").readCachedDestinationCoords;
  writeCache?: typeof import("@/lib/realm/destinationCoordinateCache").writeCachedDestinationCoords;
}): Promise<{ lat: number; lng: number; geocoded: boolean } | null> {
  const readCache =
    args.readCache ??
    (await import("@/lib/realm/destinationCoordinateCache")).readCachedDestinationCoords;
  const writeCache =
    args.writeCache ??
    (await import("@/lib/realm/destinationCoordinateCache")).writeCachedDestinationCoords;

  const { latitude, longitude } = args;
  const savedCoords = readValidCoords(latitude, longitude);
  if (savedCoords) {
    return { ...savedCoords, geocoded: false };
  }

  const cached = readCache(args.destinationId, args.destinationName);
  if (cached) return { ...cached, geocoded: false };

  const geocoded = await geocodeRouteDestination({
    destinationName: args.destinationName,
    signal: args.signal,
  });
  if (!geocoded) return null;

  writeCache({
    destinationId: args.destinationId,
    destinationName: args.destinationName,
    lat: geocoded.lat,
    lng: geocoded.lng,
  });

  void persistCampusLocationCoordinatesIfEmpty(args.destinationId, geocoded.lat, geocoded.lng);

  return { lat: geocoded.lat, lng: geocoded.lng, geocoded: true };
}

async function persistCampusLocationCoordinatesIfEmpty(
  destinationId: string | undefined,
  latitude: number,
  longitude: number,
): Promise<void> {
  const slug = destinationId?.trim();
  if (!slug || !/^[a-z0-9-]{2,64}$/.test(slug)) return;
  try {
    const { patchAuthed } = await import("@/lib/client/dashboardApi");
    await patchAuthed("/api/campus-locations/ensure-coordinates", {
      slug,
      latitude,
      longitude,
    });
  } catch {
    /* best-effort — routing still works from client cache */
  }
}
