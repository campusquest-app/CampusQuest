"use client";

import { useState } from "react";
import { Car, ChevronDown, Footprints, Loader2, Map, X } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/realm/googleMapsNavigationUrl";
import {
  REALM_DRIVING_SUGGEST_METERS,
  type RealmDirectionsDestination,
  type RealmDirectionsStatus,
  type RealmTravelMode,
} from "@/lib/realm/realmDirectionsTypes";
import { isDirectionsLoadingForDestination } from "@/lib/realm/routeUiHelpers";
import { formatRouteStatsLine } from "@/lib/realm/formatRouteSummary";

export function RealmDirectionsPanel({
  destination,
  directionsEnabled,
  directionsStatus,
  activeTravelMode,
  onRequestWalking,
  onRequestDriving,
  onClearDirections,
  onOpenInRealmMap,
  hidePrimaryWalk = false,
}: {
  destination: RealmDirectionsDestination | null;
  directionsEnabled: boolean;
  directionsStatus: RealmDirectionsStatus;
  activeTravelMode: RealmTravelMode | null;
  onRequestWalking: () => void;
  onRequestDriving: () => void;
  onClearDirections: () => void;
  onOpenInRealmMap?: () => void;
  hidePrimaryWalk?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [cardCollapsed, setCardCollapsed] = useState(false);

  if (!directionsEnabled || !destination) return null;

  const destinationLabel = destination.label;
  const ready = directionsStatus.status === "ready" ? directionsStatus : null;
  const loading = isDirectionsLoadingForDestination(destination, directionsStatus);
  const error = directionsStatus.status === "error" ? directionsStatus : null;
  const destinationCoords =
    destination.lat != null && destination.lng != null
      ? { lat: destination.lat, lng: destination.lng }
      : error?.destinationLat != null && error.destinationLng != null
        ? { lat: error.destinationLat, lng: error.destinationLng }
        : null;
  const showDriveSuggestion =
    ready?.travelMode === "WALKING" && ready.summary.distanceMeters >= REALM_DRIVING_SUGGEST_METERS;

  const openDrivingInGoogleMaps = () => {
    if (!ready || !destinationCoords) return;
    const url = buildGoogleMapsDirectionsUrl({
      origin: { lat: ready.origin.lat, lng: ready.origin.lng },
      destination: destinationCoords,
      travelMode: "DRIVING",
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenInRealmMap = () => {
    setCardCollapsed(true);
    setMoreOpen(false);
    onOpenInRealmMap?.();
  };

  if (cardCollapsed && ready?.travelMode === "WALKING") {
    return (
      <section className="cq-realm-directions cq-realm-directions--collapsed" aria-label="Directions to location">
        <button
          type="button"
          onClick={() => setCardCollapsed(false)}
          className="cq-realm-directions-collapsed-toggle touch-manipulation"
        >
          <Map className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Route open on campus map
        </button>
      </section>
    );
  }

  return (
    <section className="cq-realm-directions" aria-label="Directions to location">
      {ready == null && !loading && !hidePrimaryWalk ? (
        <button
          type="button"
          onClick={onRequestWalking}
          className="cq-realm-directions-primary touch-manipulation"
        >
          <Footprints className="h-4 w-4 shrink-0" aria-hidden />
          <span>Walk to {destinationLabel}</span>
        </button>
      ) : null}

      {loading ? (
        <div className="cq-realm-directions-status" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" aria-hidden />
          <span>
            Finding {activeTravelMode === "DRIVING" ? "driving" : "walking"} route to {destinationLabel}…
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="cq-realm-directions-error" role="alert">
          <p>{error.message}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRequestWalking} className="cq-realm-directions-retry touch-manipulation">
              Try again
            </button>
            {destinationCoords ? (
              <button
                type="button"
                onClick={() => {
                  const url = buildGoogleMapsDirectionsUrl({
                    destination: destinationCoords,
                    travelMode: "WALKING",
                  });
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                className="cq-realm-directions-retry touch-manipulation"
              >
                Open in Maps
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ready ? (
        <div className="cq-realm-directions-card">
          <div className="cq-realm-directions-card-head">
            <div className="min-w-0 flex-1">
              <p className="cq-realm-directions-eyebrow">
                {ready.travelMode === "DRIVING" ? "Drive" : "Walk"} to {ready.destinationLabel}
              </p>
              <p className="cq-realm-directions-summary">{formatRouteStatsLine(ready.summary)}</p>
              {ready.origin.hint ? (
                <p className="cq-realm-directions-hint">{ready.origin.hint}</p>
              ) : ready.origin.usedFallback ? (
                <p className="cq-realm-directions-hint">Starting from {ready.origin.label}</p>
              ) : null}
              {ready.summary.approximate ? (
                <p className="cq-realm-directions-hint">Approximate campus route</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClearDirections}
              className="cq-realm-directions-clear touch-manipulation"
              aria-label="Clear route"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {ready.travelMode === "WALKING" && onOpenInRealmMap ? (
            <div className="cq-realm-directions-realm-open">
              <button
                type="button"
                onClick={handleOpenInRealmMap}
                className="cq-realm-directions-realm-btn touch-manipulation"
              >
                <Map className="h-4 w-4 shrink-0" aria-hidden />
                <span>Open in Realm Map</span>
              </button>
              <p className="cq-realm-directions-realm-hint">See the route directly on your campus map.</p>
            </div>
          ) : null}

          {showDriveSuggestion ? (
            <button
              type="button"
              onClick={openDrivingInGoogleMaps}
              className="cq-realm-directions-secondary touch-manipulation"
            >
              <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Drive instead ({ready.summary.distanceText})
            </button>
          ) : null}

          {ready.travelMode === "WALKING" ? (
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className="cq-realm-directions-more-toggle touch-manipulation"
              aria-expanded={moreOpen}
            >
              <span>More options</span>
              <ChevronDown className={`h-3.5 w-3.5 transition ${moreOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
          ) : null}

          {moreOpen && ready.travelMode === "WALKING" ? (
            <div className="cq-realm-directions-more-panel">
              {!showDriveSuggestion ? (
                <button
                  type="button"
                  onClick={openDrivingInGoogleMaps}
                  className="cq-realm-directions-secondary touch-manipulation"
                >
                  <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Drive instead
                </button>
              ) : null}
            </div>
          ) : null}

          {ready.travelMode === "DRIVING" ? (
            <>
              <button
                type="button"
                onClick={onRequestWalking}
                className="cq-realm-directions-secondary touch-manipulation"
              >
                <Footprints className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Walk instead
              </button>
              <button
                type="button"
                onClick={openDrivingInGoogleMaps}
                className="cq-realm-directions-secondary touch-manipulation"
              >
                <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Open driving route in Google Maps
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
