import { buildApproximateCampusRoute } from "@/lib/realm/approximateCampusRoute";
import { fetchGoogleDirections } from "@/lib/realm/fetchGoogleDirections";
import { resolveRouteDestinationCoordinates } from "@/lib/realm/geocodeRouteDestination";
import { resolveLiveUserLocation, toDirectionsOrigin } from "@/lib/realm/resolveDirectionsOrigin";
import { readCachedRoute, writeCachedRoute } from "@/lib/realm/routeResultCache";
import {
  ROUTE_ERROR_MESSAGES,
  type RouteErrorCode,
} from "@/lib/realm/routeRequestConstants";
import {
  parseDirectionsSummary,
  type RealmDirectionsOrigin,
  type RealmDirectionsSummary,
  type RealmTravelMode,
} from "@/lib/realm/realmDirectionsTypes";

const IS_DEV = process.env.NODE_ENV !== "production";

function logRoute(stage: string, detail?: Record<string, unknown>): void {
  if (!IS_DEV && process.env.NEXT_PUBLIC_DEBUG_EVENT_PINS !== "true") return;
  if (detail) console.info(`[cq:route] ${stage}`, detail);
  else console.info(`[cq:route] ${stage}`);
}

export type GetRouteToLocationArgs = {
  requestId: number;
  destinationId?: string;
  destinationName: string;
  latitude?: number | null;
  longitude?: number | null;
  travelMode: RealmTravelMode;
  directionsService: google.maps.DirectionsService;
  userLocation?: { lat: number; lng: number } | null;
  signal?: AbortSignal;
  isStale?: () => boolean;
};

export type GetRouteToLocationSuccess = {
  ok: true;
  requestId: number;
  travelMode: RealmTravelMode;
  destinationLabel: string;
  destination: { lat: number; lng: number; label: string };
  summary: RealmDirectionsSummary;
  origin: RealmDirectionsOrigin;
  path: Array<{ lat: number; lng: number }>;
  directions: google.maps.DirectionsResult | null;
  approximate: boolean;
  fromCache: boolean;
};

export type GetRouteToLocationFailure = {
  ok: false;
  requestId: number;
  travelMode: RealmTravelMode;
  destinationLabel: string;
  code: RouteErrorCode;
  message: string;
  destination: { lat: number; lng: number; label: string } | null;
};

export type GetRouteToLocationResult = GetRouteToLocationSuccess | GetRouteToLocationFailure;

function failure(args: Omit<GetRouteToLocationFailure, "message"> & { message?: string }): GetRouteToLocationFailure {
  return {
    ok: false,
    requestId: args.requestId,
    travelMode: args.travelMode,
    destinationLabel: args.destinationLabel,
    code: args.code,
    message: args.message ?? ROUTE_ERROR_MESSAGES[args.code as keyof typeof ROUTE_ERROR_MESSAGES] ?? ROUTE_ERROR_MESSAGES.network,
    destination: args.destination,
  };
}

export async function getRouteToLocation(args: GetRouteToLocationArgs): Promise<GetRouteToLocationResult> {
  const destinationLabel = args.destinationName.trim() || "destination";
  logRoute("start", {
    requestId: args.requestId,
    destinationId: args.destinationId,
    destinationName: destinationLabel,
    travelMode: args.travelMode,
    hasCoords: args.latitude != null && args.longitude != null,
  });

  try {
    if (args.signal?.aborted || args.isStale?.()) {
      logRoute("aborted-early", { requestId: args.requestId });
      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "aborted",
        destination: null,
      });
    }

    const resolvedDestination = await resolveRouteDestinationCoordinates({
      destinationId: args.destinationId,
      destinationName: destinationLabel,
      latitude: args.latitude,
      longitude: args.longitude,
      signal: args.signal,
    });

    if (args.signal?.aborted || args.isStale?.()) {
      logRoute("aborted-after-geocode", { requestId: args.requestId });
      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "aborted",
        destination: null,
      });
    }

    if (!resolvedDestination) {
      logRoute("destination-not-found", { requestId: args.requestId, destinationLabel });
      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "destinationNotFound",
        destination: null,
      });
    }

    const destination = {
      lat: resolvedDestination.lat,
      lng: resolvedDestination.lng,
      label: destinationLabel,
    };

    logRoute("destination-resolved", {
      requestId: args.requestId,
      geocoded: resolvedDestination.geocoded,
      lat: destination.lat,
      lng: destination.lng,
    });

    let originPoint = args.userLocation ?? null;
    if (!originPoint) {
      originPoint = await resolveLiveUserLocation(args.signal);
    }

    if (args.signal?.aborted || args.isStale?.()) {
      logRoute("aborted-after-origin", { requestId: args.requestId });
      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "aborted",
        destination,
      });
    }

    if (!originPoint) {
      logRoute("origin-unavailable", { requestId: args.requestId });
      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "locationUnavailable",
        destination,
      });
    }

    const origin = toDirectionsOrigin(originPoint);
    const cached = readCachedRoute({
      origin: originPoint,
      destination,
      travelMode: args.travelMode,
    });

    if (cached) {
      logRoute("cache-hit", { requestId: args.requestId });
      return {
        ok: true,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        destination,
        summary: cached.summary,
        origin,
        path: cached.path,
        directions: null,
        approximate: cached.approximate,
        fromCache: true,
      };
    }

    try {
      const { result, status } = await fetchGoogleDirections({
        service: args.directionsService,
        origin: originPoint,
        destination,
        travelMode: args.travelMode,
        signal: args.signal,
      });

      if (args.signal?.aborted || args.isStale?.()) {
        logRoute("aborted-after-directions", { requestId: args.requestId });
        return failure({
          ok: false,
          requestId: args.requestId,
          travelMode: args.travelMode,
          destinationLabel,
          code: "aborted",
          destination,
        });
      }

      logRoute("directions-response", { requestId: args.requestId, status });

      if (status === google.maps.DirectionsStatus.OK) {
        const summary = parseDirectionsSummary(result);
        if (!summary) {
          return failure({
            ok: false,
            requestId: args.requestId,
            travelMode: args.travelMode,
            destinationLabel,
            code: "network",
            destination,
          });
        }
        const pathPoints = result.routes[0]?.overview_path ?? [];
        const path = pathPoints.map((point) => ({ lat: point.lat(), lng: point.lng() }));
        writeCachedRoute({
          origin: originPoint,
          destination,
          travelMode: args.travelMode,
          result: { summary, path, approximate: false },
        });
        return {
          ok: true,
          requestId: args.requestId,
          travelMode: args.travelMode,
          destinationLabel,
          destination,
          summary,
          origin,
          path,
          directions: result,
          approximate: false,
          fromCache: false,
        };
      }

      if (args.travelMode === "WALKING") {
        const fallback = buildApproximateCampusRoute({ origin, destination });
        writeCachedRoute({
          origin: originPoint,
          destination,
          travelMode: args.travelMode,
          result: {
            summary: fallback.summary,
            path: fallback.path,
            approximate: true,
          },
        });
        logRoute("walking-fallback", { requestId: args.requestId, status });
        return {
          ok: true,
          requestId: args.requestId,
          travelMode: args.travelMode,
          destinationLabel,
          destination,
          summary: fallback.summary,
          origin,
          path: fallback.path,
          directions: null,
          approximate: true,
          fromCache: false,
        };
      }

      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "network",
        destination,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        logRoute("aborted", { requestId: args.requestId });
        return failure({
          ok: false,
          requestId: args.requestId,
          travelMode: args.travelMode,
          destinationLabel,
          code: "aborted",
          destination,
        });
      }

      const isTimeout = error instanceof Error && error.message.includes("timeout");
      if (isTimeout) {
        logRoute("timeout", { requestId: args.requestId });
        if (args.travelMode === "WALKING") {
          const fallback = buildApproximateCampusRoute({ origin, destination });
          writeCachedRoute({
            origin: originPoint,
            destination,
            travelMode: args.travelMode,
            result: {
              summary: fallback.summary,
              path: fallback.path,
              approximate: true,
            },
          });
          return {
            ok: true,
            requestId: args.requestId,
            travelMode: args.travelMode,
            destinationLabel,
            destination,
            summary: fallback.summary,
            origin,
            path: fallback.path,
            directions: null,
            approximate: true,
            fromCache: false,
          };
        }
        return failure({
          ok: false,
          requestId: args.requestId,
          travelMode: args.travelMode,
          destinationLabel,
          code: "timeout",
          destination,
        });
      }

      logRoute("network-error", {
        requestId: args.requestId,
        message: error instanceof Error ? error.message : String(error),
      });

      if (args.travelMode === "WALKING") {
        const fallback = buildApproximateCampusRoute({ origin, destination });
        return {
          ok: true,
          requestId: args.requestId,
          travelMode: args.travelMode,
          destinationLabel,
          destination,
          summary: fallback.summary,
          origin,
          path: fallback.path,
          directions: null,
          approximate: true,
          fromCache: false,
        };
      }

      return failure({
        ok: false,
        requestId: args.requestId,
        travelMode: args.travelMode,
        destinationLabel,
        code: "network",
        destination,
      });
    }
  } finally {
    logRoute("cleanup", { requestId: args.requestId });
  }
}
