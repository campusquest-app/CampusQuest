"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { buildApproximateCampusRoute } from "@/lib/realm/approximateCampusRoute";
import { resolveDirectionsOrigin } from "@/lib/realm/resolveDirectionsOrigin";
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

function fitRouteBounds(
  map: google.maps.Map,
  path: google.maps.LatLng[],
  bottomPadding: number,
): void {
  const bounds = new google.maps.LatLngBounds();
  for (const point of path) bounds.extend(point);
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { top: 88, right: 44, bottom: bottomPadding, left: 44 });
  }
}

/**
 * Fetches walking/driving routes and renders them on the Realm map.
 * Walking falls back to an approximate straight-line campus route when the API fails.
 */
export function RealmDirectionsOverlay({
  request,
  enabled,
  routeSheetOpen = false,
  onLoaded,
  onError,
}: {
  request: RealmDirectionsRequest | null;
  enabled: boolean;
  routeSheetOpen?: boolean;
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
    const path = pathInput.map((point) => new google.maps.LatLng(point.lat, point.lng));
    glowRef.current?.setPath(path);
    lineRef.current?.setPath(path);
    lineRef.current?.setOptions({ icons: buildPulseIcons() });
    markersRef.current = { origin, destination };
    setMarkerTick((n) => n + 1);
    if (map) {
      fitRouteBounds(map, path, routeSheetOpen ? 240 : 200);
    }
  };

  useEffect(() => {
    const glow = glowRef.current;
    const line = lineRef.current;
    const service = serviceRef.current;

    if (!enabled || !request || !glow || !line || !service || !map) {
      activeRequestIdRef.current = null;
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
      const origin = await resolveDirectionsOrigin();
      if (cancelled || activeRequestIdRef.current !== requestId) return;

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
  }, [enabled, map, onError, onLoaded, request, routeSheetOpen]);

  const markers = markersRef.current;

  return (
    <RealmRouteMarkers
      visible={enabled && Boolean(markers.origin && markers.destination)}
      origin={markers.origin ? { lat: markers.origin.lat, lng: markers.origin.lng, label: markers.origin.label } : null}
      destination={markers.destination}
    />
  );
}