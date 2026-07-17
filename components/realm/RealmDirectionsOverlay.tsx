"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { getRouteToLocation } from "@/lib/realm/getRouteToLocation";
import {
  GOOGLE_ATTRIBUTION_BAND_PX,
  measureRealmNavClearancePx,
} from "@/lib/realm/mapChromePadding";
import {
  type RealmDirectionsOrigin,
  type RealmDirectionsRequest,
} from "@/lib/realm/realmDirectionsTypes";
import { markRealmMapStep } from "@/lib/realm/realmMapLifecycle";
import { logWalkRoute } from "@/lib/realm/walkRouteLog";
import { RealmRouteMarkers } from "./RealmRouteMarkers";
import type { RealmDirectionsLoadResult } from "./RealmDirectionsOverlay.types";

export type { RealmDirectionsLoadResult } from "./RealmDirectionsOverlay.types";

/** Dock + Google attribution band clearance so fitBounds never tucks under UI. */
function bottomNavClearancePx(): number {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return GOOGLE_ATTRIBUTION_BAND_PX;
  }
  const measured = measureRealmNavClearancePx();
  if (measured > 0) return measured + GOOGLE_ATTRIBUTION_BAND_PX;
  const nav = document.querySelector(".cq-dock-nav");
  if (!(nav instanceof HTMLElement)) return GOOGLE_ATTRIBUTION_BAND_PX;
  const rect = nav.getBoundingClientRect();
  if (rect.height === 0) return GOOGLE_ATTRIBUTION_BAND_PX;
  return Math.max(0, Math.round(window.innerHeight - rect.top)) + GOOGLE_ATTRIBUTION_BAND_PX;
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
 * One DirectionsService per map instance. Fetch lifecycle is keyed only by
 * request.id — abort signals and sheet padding must not restart the request.
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
  userLocation?: { lat: number; lng: number } | null;
  onUserLocation?: (pos: { lat: number; lng: number }) => void;
  onLoaded: (result: RealmDirectionsLoadResult & { ok: true }) => void;
  onError: (result: RealmDirectionsLoadResult & { ok: false }) => void;
}) {
  const map = useMap();
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const serviceRef = useRef<google.maps.DirectionsService | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userLocationRef = useRef(userLocation);
  const routeSheetOpenRef = useRef(routeSheetOpen);
  const onLoadedRef = useRef(onLoaded);
  const onErrorRef = useRef(onError);
  const onUserLocationRef = useRef(onUserLocation);
  userLocationRef.current = userLocation;
  routeSheetOpenRef.current = routeSheetOpen;
  onLoadedRef.current = onLoaded;
  onErrorRef.current = onError;
  onUserLocationRef.current = onUserLocation;

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
      abortRef.current?.abort();
      abortRef.current = null;
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
      const basePadding = routeSheetOpenRef.current ? 240 : 200;
      fitRouteBounds(map, path, origin, destination, basePadding + bottomNavClearancePx());
    }
  };

  const requestId = request?.id ?? null;

  useEffect(() => {
    const glow = glowRef.current;
    const line = lineRef.current;
    const service = serviceRef.current;

    if (!enabled || requestId == null || !request || !glow || !line || !service || !map) {
      abortRef.current?.abort();
      abortRef.current = null;
      activeRequestIdRef.current = null;
      clearRoute();
      return undefined;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    activeRequestIdRef.current = requestId;

    const destinationSnapshot = request.destination;
    const travelMode = request.travelMode;
    let cancelled = false;

    const isStale = () =>
      cancelled || activeRequestIdRef.current !== requestId || controller.signal.aborted;

    logWalkRoute("route requested", {
      requestId,
      destination: destinationSnapshot.label,
      travelMode,
      hasCoords: destinationSnapshot.lat != null && destinationSnapshot.lng != null,
    });

    void (async () => {
      try {
        const result = await getRouteToLocation({
          requestId,
          destinationId: destinationSnapshot.id,
          destinationName: destinationSnapshot.label,
          latitude: destinationSnapshot.lat,
          longitude: destinationSnapshot.lng,
          travelMode,
          directionsService: service,
          userLocation: userLocationRef.current,
          signal: controller.signal,
          isStale,
        });

        if (isStale()) {
          logWalkRoute("stale response ignored", { requestId });
          return;
        }

        if (!result.ok) {
          if (result.code === "aborted") {
            logWalkRoute("aborted", { requestId });
            return;
          }
          logWalkRoute("failure", {
            requestId,
            code: result.code,
            message: result.message,
          });
          onErrorRef.current({
            ok: false,
            requestId,
            travelMode: result.travelMode,
            destinationLabel: result.destinationLabel,
            message: result.message,
            destinationLat: result.destination?.lat,
            destinationLng: result.destination?.lng,
          });
          clearRoute();
          return;
        }

        logWalkRoute("route returned", {
          requestId,
          fromCache: result.fromCache,
          approximate: result.approximate,
        });
        logWalkRoute("destination resolved", {
          requestId,
          lat: result.destination.lat,
          lng: result.destination.lng,
        });

        if (!userLocationRef.current && result.origin) {
          onUserLocationRef.current?.({ lat: result.origin.lat, lng: result.origin.lng });
        }

        applyPath(result.path, result.origin, result.destination);
        markRealmMapStep("overlay-creation", {
          type: "directions",
          approximate: result.approximate,
          fromCache: result.fromCache,
        });
        onLoadedRef.current({
          ok: true,
          requestId,
          travelMode: result.travelMode,
          destinationLabel: result.destinationLabel,
          summary: result.summary,
          origin: result.origin,
          directions: result.directions,
          approximate: result.approximate,
        });
      } catch (error) {
        if (isStale()) return;
        logWalkRoute("failure", {
          requestId,
          message: error instanceof Error ? error.message : String(error),
        });
        onErrorRef.current({
          ok: false,
          requestId,
          travelMode,
          destinationLabel: destinationSnapshot.label,
          message: "Unable to load the route. Try again.",
          destinationLat: destinationSnapshot.lat,
          destinationLng: destinationSnapshot.lng,
        });
        clearRoute();
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        logWalkRoute("cleanup", { requestId, cancelled: isStale() });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
    // Intentionally keyed only by request id + enabled + map.
    // Callbacks, abort props, userLocation, and routeSheetOpen use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request fields read from request when id changes
  }, [enabled, map, requestId]);

  // Refit padding when the route sheet opens/closes without re-fetching.
  useEffect(() => {
    const markers = markersRef.current;
    if (!map || !markers.origin || !markers.destination) return;
    const path = lineRef.current?.getPath();
    if (!path || path.getLength() === 0) return;
    const points: google.maps.LatLng[] = [];
    path.forEach((point) => points.push(point));
    const basePadding = routeSheetOpen ? 240 : 200;
    fitRouteBounds(
      map,
      points,
      markers.origin,
      markers.destination,
      basePadding + bottomNavClearancePx(),
    );
  }, [map, routeSheetOpen]);

  const markers = markersRef.current;

  return (
    <RealmRouteMarkers
      visible={enabled && Boolean(markers.origin && markers.destination)}
      origin={markers.origin ? { lat: markers.origin.lat, lng: markers.origin.lng, label: markers.origin.label } : null}
      destination={markers.destination}
    />
  );
}
