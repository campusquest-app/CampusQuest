"use client";

import { useState } from "react";
import { Car, ChevronDown, ExternalLink, Footprints, Loader2, X } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/realm/googleMapsNavigationUrl";
import {
  REALM_DRIVING_SUGGEST_METERS,
  type RealmDirectionsDestination,
  type RealmDirectionsStatus,
} from "@/lib/realm/realmDirectionsTypes";

export function RealmDirectionsPanel({
  destination,
  directionsEnabled,
  directionsStatus,
  activeTravelMode,
  onRequestWalking,
  onRequestDriving,
  onClearDirections,
  hidePrimaryWalk = false,
}: {
  destination: RealmDirectionsDestination | null;
  directionsEnabled: boolean;
  directionsStatus: RealmDirectionsStatus;
  activeTravelMode: "WALKING" | "DRIVING" | null;
  onRequestWalking: () => void;
  onRequestDriving: () => void;
  onClearDirections: () => void;
  /** When true, the primary walk CTA is omitted (e.g. actions bar already shows it). */
  hidePrimaryWalk?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (!directionsEnabled || !destination) return null;

  const destinationLabel = destination.label;
  const ready = directionsStatus.status === "ready" ? directionsStatus : null;
  const loading = directionsStatus.status === "loading";
  const error = directionsStatus.status === "error" ? directionsStatus : null;
  const showDriveSuggestion =
    ready?.travelMode === "WALKING" && ready.summary.distanceMeters >= REALM_DRIVING_SUGGEST_METERS;

  const externalUrl =
    ready != null
      ? buildGoogleMapsDirectionsUrl({
          origin: { lat: ready.origin.lat, lng: ready.origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: ready.travelMode,
        })
      : buildGoogleMapsDirectionsUrl({
          origin: { lat: destination.lat, lng: destination.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: "WALKING",
        });

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
          <button type="button" onClick={onRequestWalking} className="cq-realm-directions-retry touch-manipulation">
            Try again
          </button>
        </div>
      ) : null}

      {ready ? (
        <div className="cq-realm-directions-card">
          <div className="cq-realm-directions-card-head">
            <div className="min-w-0 flex-1">
              <p className="cq-realm-directions-eyebrow">
                {ready.travelMode === "DRIVING" ? "Drive" : "Walk"} to {ready.destinationLabel}
              </p>
              <p className="cq-realm-directions-summary">
                <span>{ready.summary.durationText}</span>
                <span className="cq-realm-directions-dot" aria-hidden>
                  ·
                </span>
                <span>{ready.summary.distanceText}</span>
              </p>
              {ready.origin.hint ? (
                <p className="cq-realm-directions-hint">{ready.origin.hint}</p>
              ) : ready.origin.usedFallback ? (
                <p className="cq-realm-directions-hint">Starting from {ready.origin.label}</p>
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

          {showDriveSuggestion ? (
            <button
              type="button"
              onClick={onRequestDriving}
              className="cq-realm-directions-secondary touch-manipulation"
            >
              <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Drive instead ({ready.summary.distanceText})
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className="cq-realm-directions-more-toggle touch-manipulation"
            aria-expanded={moreOpen}
          >
            <span>More options</span>
            <ChevronDown className={`h-3.5 w-3.5 transition ${moreOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>

          {moreOpen ? (
            <div className="cq-realm-directions-more-panel">
              {ready.travelMode === "WALKING" && !showDriveSuggestion ? (
                <button
                  type="button"
                  onClick={onRequestDriving}
                  className="cq-realm-directions-secondary touch-manipulation"
                >
                  <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Drive instead
                </button>
              ) : null}
              {ready.travelMode === "DRIVING" ? (
                <button
                  type="button"
                  onClick={onRequestWalking}
                  className="cq-realm-directions-secondary touch-manipulation"
                >
                  <Footprints className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Walk instead
                </button>
              ) : null}
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cq-realm-directions-external"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Open in Google Maps
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
