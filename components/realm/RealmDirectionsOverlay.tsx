"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { getRouteToLocation } from "@/lib/realm/getRouteToLocation";
import {
  type RealmDirectionsOrigin,
  type RealmDirectionsRequest,
} from "@/lib/realm/realmDirectionsTypes";
import { markRealmMapStep } from "@/lib/realm/realmMapLifecycle";
import { RealmRouteMarkers } from "./RealmRouteMarkers";
import type { RealmDirectionsLoadResult } from "./RealmDirectionsOverlay.types";

export type { RealmDirectionsLoadResult } from "./RealmDirectionsOverlay.types";

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
  bounds.extend(new google.maps.LatLng(origin.lat, origin.lng));
  bounds.extend(new google.maps.LatLng(destination.lat, destination.lng));
  for (const point of path) bounds.extend(point);
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { top: 88, right: 44, bottom: bottomPadding, left: 44 });
  }
}

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

/**
 * Fetches walking/driving routes and renders them on the Realm map.
 */
export function RealmDirectionsOverlay({
  request,
  enabled,
  routeSheetOpen = false,
  userLocation = null,
  abortSignal = null,
  onUserLocation,
  onLoaded,
  onError,
}: {
  request: RealmDirectionsRequest | null;
  enabled: boolean;
  routeSheetOpen?: boolean;
  userLocation?: { lat: number; lng: number } | null;
  abortSignal?: AbortSignal | null;
  onUserLocation?: (pos: { lat: number; lng: number }) => void;
  onLoaded: (result: RealmDirectionsLoadResult & { ok: true }) => void;
  onError: (result: RealmDirectionsLoadResult & { ok: false }) => void;
}) {
  const map = useMap();
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const serviceRef = useRef<google.maps.DirectionsService | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
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
      clearRoute();
      return undefined;
    }

    const requestId = request.id;
    activeRequestIdRef.current = requestId;
    let cancelled = false;

    const isStale = () => cancelled || activeRequestIdRef.current !== requestId;

    let settled = false;

    void (async () => {
      try {
        const result = await getRouteToLocation({
          requestId,
          destinationId: request.destination.id,
          destinationName: request.destination.label,
          latitude: request.destination.lat,
          longitude: request.destination.lng,
          travelMode: request.travelMode,
          directionsService: service,
          userLocation: userLocationRef.current,
          signal: abortSignal ?? undefined,
          isStale,
        });

        if (isStale()) return;

        if (!result.ok) {
          if (result.code === "aborted") return;
          onError({
            ok: false,
            requestId,
            travelMode: result.travelMode,
            destinationLabel: result.destinationLabel,
            message: result.message,
            destinationLat: result.destination?.lat,
            destinationLng: result.destination?.lng,
          });
          settled = true;
          clearRoute();
          return;
        }

        if (!userLocationRef.current && result.origin) {
          onUserLocation?.({ lat: result.origin.lat, lng: result.origin.lng });
        }

        applyPath(result.path, result.origin, result.destination);
        markRealmMapStep("overlay-creation", {
          type: "directions",
          approximate: result.approximate,
          fromCache: result.fromCache,
        });
        onLoaded({
          ok: true,
          requestId,
          travelMode: result.travelMode,
          destinationLabel: result.destinationLabel,
          summary: result.summary,
          origin: result.origin,
          directions: result.directions,
          approximate: result.approximate,
        });
        settled = true;
      } catch (error) {
        if (isStale()) return;
        onError({
          ok: false,
          requestId,
          travelMode: request.travelMode,
          destinationLabel: request.destination.label,
          message: "Route unavailable right now.",
          destinationLat: request.destination.lat,
          destinationLng: request.destination.lng,
        });
        settled = true;
        clearRoute();
      } finally {
        if (!settled && !isStale() && !abortSignal?.aborted) {
          onError({
            ok: false,
            requestId,
            travelMode: request.travelMode,
            destinationLabel: request.destination.label,
            message: "Route unavailable right now.",
            destinationLat: request.destination.lat,
            destinationLng: request.destination.lng,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
      }
    };
  }, [
    abortSignal,
    enabled,
    map,
    onError,
    onLoaded,
    onUserLocation,
    request,
    routeSheetOpen,
  ]);

  const markers = markersRef.current;

  return (
    <RealmRouteMarkers
      visible={enabled && Boolean(markers.origin && markers.destination)}
      origin={markers.origin ? { lat: markers.origin.lat, lng: markers.origin.lng, label: markers.origin.label } : null}
      destination={markers.destination}
    />
  );
}
