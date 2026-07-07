"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { buildApproximateCampusRoute } from "@/lib/realm/approximateCampusRoute";
import { resolveLiveUserLocation, toDirectionsOrigin } from "@/lib/realm/resolveDirectionsOrigin";
import {
  parseDirectionsSummary,
  type RealmDirectionsOrigin,
  type RealmDirectionsRequest,
  type RealmDirectionsSummary,
  type RealmTravelMode,
} from "@/lib/realm/realmDirectionsTypes";
import { markRealmMapStep } from "@/lib/realm/realmMapLifecycle";
import { RealmRouteMarkers } from "./RealmRouteMarkers";

export type RealmDirectionsLoadResult =
  | {
      ok: true;
      requestId: number;
      travelMode: RealmTravelMode;
      destinationLabel: string;
      summary: RealmDirectionsSummary;
      origin: RealmDirectionsOrigin;
      directions: google.maps.DirectionsResult | null;
      approximate: boolean;
    }
  | {
      ok: false;
      requestId: number;
      travelMode: RealmTravelMode;
      destinationLabel: string;
      message: string;
    };

const ROUTE_GLOW = {
  strokeColor: "#4baeff",
  strokeOpacity: 0.28,
  strokeWeight: 12,
  zIndex: 2,
} as const;

const ROUTE_LINE = {
  strokeColor: "#7dd3fc",
  strokeOpacity: 0.95,
  strokeWeight: 6,
  zIndex: 4,
} as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buildPulseIcons(): google.maps.IconSequence[] | undefined {
  if (prefersReducedMotion()) return undefined;
  return [
    {
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#e0f2fe",
        fillOpacity: 0.9,
        strokeColor: "#4baeff",
        strokeOpacity: 0.45,
        strokeWeight: 1,
        scale: 2.4,
      },
      offset: "0",
      repeat: "48px",
    },
  ];
}

/** Height the floating bottom nav (plus safe area) occupies over the map, in px. */
function bottomNavClearancePx(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const nav = document.querySelector(".cq-dock-nav");
  if (!(nav instanceof HTMLElement)) return 0;
  const rect = nav.getBoundingClientRect();
  if (rect.height === 0) return 0;
  return Math.max(0, Math.round(window.innerHeight - rect.top));
}

function fitRouteBounds(
  map: google.maps.Map,
  path: google.maps.LatLng[],
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  bottomPadding: number,
): void {
  const bounds = new google.maps.LatLngBounds();
  // Always include both endpoints so the blue user marker and the
  // destination marker stay in view — never center on the destination alone.
  bounds.extend(new google.maps.LatLng(origin.lat, origin.lng));
  bounds.extend(new google.maps.LatLng(destination.lat, destination.lng));
  for (const point of path) bounds.extend(point);
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { top: 88, right: 44, bottom: bottomPadding, left: 44 });
  }
}

function isValidLatLng(point: { lat?: number; lng?: number } | null | undefined): point is {
  lat: number;
  lng: number;
} {
  return (
    point != null &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  );
}

/**
 * Fetches walking/driving routes and renders them on the Realm map.
 * Walking falls back to an approximate straight-line campus route when the API fails.
 */
export function RealmDirectionsOverlay({
  request,
  enabled,
  routeSheetOpen = false,
  userLocation = null,
  onUserLocation,
  onLoaded,
  onError,
}: {
  request: RealmDirectionsRequest | null;
  enabled: boolean;
  routeSheetOpen?: boolean;
  /** Blue user-location marker coordinates — the source of truth for route origin. */
  userLocation?: { lat: number; lng: number } | null;
  /** Reports a fresh GPS fix so the blue marker renders where the route starts. */
  onUserLocation?: (pos: { lat: number; lng: number }) => void;
  onLoaded: (result: RealmDirectionsLoadResult & { ok: true }) => void;
  onError: (result: RealmDirectionsLoadResult & { ok: false }) => void;
}) {
  const map = useMap();
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const serviceRef = useRef<google.maps.DirectionsService | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);
  const markersRef = useRef<{
    origin: RealmDirectionsOrigin | null;
    destination: { lat: number; lng: number; label: string } | null;
  }>({ origin: null, destination: null });
  const lastRoutedRef = useRef<{ requestId: number; lat: number; lng: number } | null>(null);
  const [, setMarkerTick] = useState(0);

  useEffect(() => {
    if (!map) return undefined;

    const glow = new google.maps.Polyline({ map, ...ROUTE_GLOW });
    const line = new google.maps.Polyline({
      map,
      ...ROUTE_LINE,
      icons: buildPulseIcons(),
    });
    const service = new google.maps.DirectionsService();

    glowRef.current = glow;
    lineRef.current = line;
    serviceRef.current = service;

    return () => {
      activeRequestIdRef.current = null;
      glow.setMap(null);
      line.setMap(null);
      glowRef.current = null;
      lineRef.current = null;
      serviceRef.current = null;
      markersRef.current = { origin: null, destination: null };
    };
  }, [map]);

  const clearRoute = () => {
    glowRef.current?.setPath([]);
    lineRef.current?.setPath([]);
    markersRef.current = { origin: null, destination: null };
    setMarkerTick((n) => n + 1);
  };

  const applyPath = (
    pathInput: Array<{ lat: number; lng: number }>,
    origin: RealmDirectionsOrigin,
    destination: { lat: number; lng: number; label: string },
  ) => {
    // Anchor the polyline: first point = user location, last point = destination.
    const points = [
      { lat: origin.lat, lng: origin.lng },
      ...pathInput,
      { lat: destination.lat, lng: destination.lng },
    ];
    const path = points.map((point) => new google.maps.LatLng(point.lat, point.lng));
    glowRef.current?.setPath(path);
    lineRef.current?.setPath(path);
    lineRef.current?.setOptions({ icons: buildPulseIcons() });
    markersRef.current = { origin, destination };
    setMarkerTick((n) => n + 1);
    if (map) {
      // Camera padding accounts for the route sheet and the floating bottom nav.
      const basePadding = routeSheetOpen ? 240 : 200;
      fitRouteBounds(map, path, origin, destination, basePadding + bottomNavClearancePx());
    }
  };

  useEffect(() => {
    const glow = glowRef.current;
    const line = lineRef.current;
    const service = serviceRef.current;

    if (!enabled || !request || !glow || !line || !service || !map) {
      activeRequestIdRef.current = null;
      lastRoutedRef.current = null;
      clearRoute();
      return undefined;
    }

    const requestId = request.id;
    activeRequestIdRef.current = requestId;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finishError = (message: string) => {
      onError({
        ok: false,
        requestId,
        travelMode: request.travelMode,
        destinationLabel: request.destination.label,
        message,
      });
      clearRoute();
    };

    const finishSuccess = (args: {
      origin: RealmDirectionsOrigin;
      summary: RealmDirectionsSummary;
      path: Array<{ lat: number; lng: number }>;
      directions: google.maps.DirectionsResult | null;
      approximate: boolean;
    }) => {
      applyPath(args.path, args.origin, request.destination);
      markRealmMapStep("overlay-creation", { type: "directions", approximate: args.approximate });
      onLoaded({
        ok: true,
        requestId,
        travelMode: request.travelMode,
        destinationLabel: request.destination.label,
        summary: args.summary,
        origin: args.origin,
        directions: args.directions,
        approximate: args.approximate,
      });
    };

    void (async () => {
      const destination = request.destination;
      if (!isValidLatLng(destination)) {
        finishError("This building does not have coordinates yet.");
        return;
      }

      // Route origin = blue user marker. Use its live coordinates when
      // present; otherwise take a fresh GPS fix and sync the marker to it.
      let originPoint = isValidLatLng(userLocation) ? userLocation : null;
      if (!originPoint) {
        originPoint = await resolveLiveUserLocation();
        if (cancelled || activeRequestIdRef.current !== requestId) return;
        if (originPoint) onUserLocation?.(originPoint);
      }

      if (!isValidLatLng(originPoint)) {
        finishError("Turn on location to show your route.");
        return;
      }

      // Skip refetch when this exact request already routed from this origin
      // (e.g. the effect re-ran because we reported the GPS fix upward).
      const last = lastRoutedRef.current;
      if (last && last.requestId === requestId && last.lat === originPoint.lat && last.lng === originPoint.lng) {
        return;
      }
      lastRoutedRef.current = { requestId, lat: originPoint.lat, lng: originPoint.lng };

      const origin = toDirectionsOrigin(originPoint);

      if (process.env.NODE_ENV === "development") {
        console.log("[Realm Route] origin user location:", originPoint);
        console.log("[Realm Route] destination:", destination);
      }

      if (request.travelMode === "WALKING") {
        timeoutId = setTimeout(() => {
          if (cancelled || activeRequestIdRef.current !== requestId) return;
          const fallback = buildApproximateCampusRoute({
            origin,
            destination: request.destination,
          });
          finishSuccess({
            origin,
            summary: fallback.summary,
            path: fallback.path,
            directions: null,
            approximate: true,
          });
        }, 12_000);
      }

      service.route(
        {
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: request.destination.lat, lng: request.destination.lng },
          travelMode:
            request.travelMode === "DRIVING"
              ? google.maps.TravelMode.DRIVING
              : google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (cancelled || activeRequestIdRef.current !== requestId) return;

          if (status === google.maps.DirectionsStatus.OK && result) {
            const summary = parseDirectionsSummary(result);
            if (!summary) {
              finishError("Route unavailable right now.");
              return;
            }
            const pathPoints = result.routes[0]?.overview_path ?? [];
            finishSuccess({
              origin,
              summary,
              path: pathPoints.map((point) => ({ lat: point.lat(), lng: point.lng() })),
              directions: result,
              approximate: false,
            });
            return;
          }

          if (request.travelMode === "WALKING") {
            const fallback = buildApproximateCampusRoute({
              origin,
              destination: request.destination,
            });
            finishSuccess({
              origin,
              summary: fallback.summary,
              path: fallback.path,
              directions: null,
              approximate: true,
            });
            return;
          }

          const message =
            status === google.maps.DirectionsStatus.ZERO_RESULTS
              ? "No driving route found to this location."
              : "Route unavailable right now.";
          finishError(message);
        },
      );
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // userLocation lat/lng in deps: moving the blue marker re-routes from the new origin.
  }, [enabled, map, onError, onLoaded, onUserLocation, request, routeSheetOpen, userLocation?.lat, userLocation?.lng]);

  const markers = markersRef.current;

  return (
    <RealmRouteMarkers
      visible={enabled && Boolean(markers.origin && markers.destination)}
      origin={markers.origin ? { lat: markers.origin.lat, lng: markers.origin.lng, label: markers.origin.label } : null}
      destination={markers.destination}
    />
  );
}