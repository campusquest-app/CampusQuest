export const ROUTE_REQUEST_TIMEOUT_MS = 8_000;
export const ROUTE_CACHE_TTL_MS = 90_000;
export const DESTINATION_COORD_CACHE_TTL_MS = 24 * 60 * 60_000;

export const ROUTE_ERROR_MESSAGES = {
  locationUnavailable: "Turn on location access to create a route.",
  destinationNotFound: "We couldn't locate this campus destination.",
  timeout: "Unable to load the route. Try again.",
  network: "Unable to load the route. Try again.",
  aborted: "Route lookup canceled.",
  missingCoordinates: "We couldn't locate this campus destination.",
} as const;

export type RouteErrorCode = keyof typeof ROUTE_ERROR_MESSAGES | "unknown";

export function routeErrorMessage(code: RouteErrorCode): string {
  return ROUTE_ERROR_MESSAGES[code as keyof typeof ROUTE_ERROR_MESSAGES] ?? ROUTE_ERROR_MESSAGES.network;
}

export function destinationCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function routeCacheKey(args: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  travelMode: string;
}): string {
  return [
    args.travelMode,
    destinationCoordKey(args.originLat, args.originLng),
    destinationCoordKey(args.destLat, args.destLng),
  ].join("|");
}
