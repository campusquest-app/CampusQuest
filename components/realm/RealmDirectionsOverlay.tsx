"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { resolveDirectionsOrigin } from "@/lib/realm/resolveDirectionsOrigin";
import {
  parseDirectionsSummary,
  type RealmDirectionsOrigin,
  type RealmDirectionsRequest,
  type RealmDirectionsSummary,
  type RealmTravelMode,
} from "@/lib/realm/realmDirectionsTypes";
import { markRealmMapStep } from "@/lib/realm/realmMapLifecycle";

export type RealmDirectionsLoadResult =
  | {
      ok: true;
      requestId: number;
      travelMode: RealmTravelMode;
      destinationLabel: string;
      summary: RealmDirectionsSummary;
      origin: RealmDirectionsOrigin;
      directions: google.maps.DirectionsResult;
    }
  | {
      ok: false;
      requestId: number;
      travelMode: RealmTravelMode;
      destinationLabel: string;
      message: string;
    };

function createGlowPolyline(map: google.maps.Map): google.maps.Polyline {
  return new google.maps.Polyline({
    map,
    strokeColor: "#4baeff",
    strokeOpacity: 0.22,
    strokeWeight: 10,
    zIndex: 2,
  });
}

function applyRouteGlow(polyline: google.maps.Polyline, path: google.maps.LatLng[]): void {
  polyline.setPath(path);
}

/**
 * Fetches walking/driving routes via DirectionsService and renders them with DirectionsRenderer.
 * CampusQuest markers are preserved (suppressMarkers: true).
 */
export function RealmDirectionsOverlay({
  request,
  enabled,
  onLoaded,
  onError,
}: {
  request: RealmDirectionsRequest | null;
  enabled: boolean;
  onLoaded: (result: RealmDirectionsLoadResult & { ok: true }) => void;
  onError: (result: RealmDirectionsLoadResult & { ok: false }) => void;
}) {
  const map = useMap();
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const serviceRef = useRef<google.maps.DirectionsService | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return undefined;

    const renderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {
        strokeColor: "#7dd3fc",
        strokeOpacity: 0.92,
        strokeWeight: 5,
        zIndex: 4,
        icons: [
          {
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: "#e0f2fe",
              fillOpacity: 0.85,
              strokeColor: "#4baeff",
              strokeOpacity: 0.5,
              strokeWeight: 1,
              scale: 2.2,
            },
            offset: "0",
            repeat: "42px",
          },
        ],
      },
    });
    const glow = createGlowPolyline(map);
    const service = new google.maps.DirectionsService();

    rendererRef.current = renderer;
    glowRef.current = glow;
    serviceRef.current = service;

    return () => {
      activeRequestIdRef.current = null;
      renderer.setMap(null);
      glow.setMap(null);
      rendererRef.current = null;
      glowRef.current = null;
      serviceRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const glow = glowRef.current;
    const service = serviceRef.current;

    if (!enabled || !request || !renderer || !glow || !service) {
      activeRequestIdRef.current = null;
      renderer?.set("directions", null);
      glow?.setPath([]);
      return undefined;
    }

    const requestId = request.id;
    activeRequestIdRef.current = requestId;
    let cancelled = false;

    void (async () => {
      const origin = await resolveDirectionsOrigin();
      if (cancelled || activeRequestIdRef.current !== requestId) return;

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
          if (cancelled || activeRequestIdRef.current !== requestId) return;

          if (status !== google.maps.DirectionsStatus.OK || !result) {
            onError({
              ok: false,
              requestId,
              travelMode: request.travelMode,
              destinationLabel: request.destination.label,
              message:
                status === google.maps.DirectionsStatus.ZERO_RESULTS
                  ? "No walking route found to this location."
                  : "Could not load directions right now. Try again in a moment.",
            });
            renderer.set("directions", null);
            glow.setPath([]);
            return;
          }

          const summary = parseDirectionsSummary(result);
          if (!summary) {
            onError({
              ok: false,
              requestId,
              travelMode: request.travelMode,
              destinationLabel: request.destination.label,
              message: "Could not read route details from Google Maps.",
            });
            return;
          }

          renderer.setDirections(result);
          const path = result.routes[0]?.overview_path ?? [];
          applyRouteGlow(glow, path);
          markRealmMapStep("overlay-creation", { type: "directions" });

          const bounds = new google.maps.LatLngBounds();
          for (const point of path) bounds.extend(point);
          if (!bounds.isEmpty()) {
            map?.fitBounds(bounds, { top: 96, right: 48, bottom: 220, left: 48 });
          }

          onLoaded({
            ok: true,
            requestId,
            travelMode: request.travelMode,
            destinationLabel: request.destination.label,
            summary,
            origin,
            directions: result,
          });
        },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, map, onError, onLoaded, request]);

  return null;
}
