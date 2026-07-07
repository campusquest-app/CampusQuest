"use client";

import { CampusQuestMapMarker } from "./CampusQuestMapMarker";

export function RealmRouteMarkers({
  origin,
  destination,
  visible,
}: {
  origin: { lat: number; lng: number; label?: string } | null;
  destination: { lat: number; lng: number; label: string } | null;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <>
      {origin ? (
        <CampusQuestMapMarker position={origin} zIndex={6}>
          <span className="cq-route-marker cq-route-marker--start" aria-label="Route start">
            <span className="cq-route-marker-pulse" aria-hidden />
          </span>
        </CampusQuestMapMarker>
      ) : null}
      {destination ? (
        <CampusQuestMapMarker position={destination} zIndex={7}>
          <span className="cq-route-marker cq-route-marker--end" aria-label={`Destination: ${destination.label}`}>
            <span className="cq-route-marker-pin" aria-hidden />
          </span>
        </CampusQuestMapMarker>
      ) : null}
    </>
  );
}
