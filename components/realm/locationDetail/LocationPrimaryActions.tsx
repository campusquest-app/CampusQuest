"use client";

import { Camera, ChevronRight, Footprints } from "lucide-react";
import type { RealmDirectionsDestination, RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";
import { formatRouteStatsLine } from "@/lib/realm/formatRouteSummary";
import { isDirectionsLoadingForDestination } from "@/lib/realm/routeUiHelpers";

function walkSubtitle(
  destination: RealmDirectionsDestination | null,
  status: RealmDirectionsStatus,
  loading: boolean,
): string | null {
  if (loading) return "Finding route…";
  if (
    status.status === "ready" &&
    destination &&
    status.destinationLabel === destination.label
  ) {
    return formatRouteStatsLine({
      durationText: status.summary.durationText,
      distanceText: status.summary.distanceText,
      turnCount: undefined,
    });
  }
  return null;
}

export function LocationPrimaryActions({
  directionsEnabled,
  directionsDestination,
  directionsStatus,
  onRequestWalking,
  onAddMemory,
}: {
  directionsEnabled: boolean;
  directionsDestination: RealmDirectionsDestination | null;
  directionsStatus: RealmDirectionsStatus;
  onRequestWalking?: () => void;
  onAddMemory?: () => void;
}) {
  const showWalk = Boolean(directionsEnabled && directionsDestination && onRequestWalking);
  const walkLoading = isDirectionsLoadingForDestination(directionsDestination, directionsStatus);
  const walkMeta = walkSubtitle(directionsDestination, directionsStatus, walkLoading);

  if (!showWalk && !onAddMemory) return null;

  return (
    <div className="cq-loc-actions" role="region" aria-label="Location actions">
      {showWalk ? (
        <button
          type="button"
          className="cq-loc-action cq-loc-action--walk touch-manipulation"
          onClick={onRequestWalking}
          aria-busy={walkLoading}
        >
          <Footprints className="cq-loc-action-icon h-5 w-5" strokeWidth={2.2} aria-hidden />
          <span className="cq-loc-action-copy">
            <span className="cq-loc-action-title">{walkLoading ? "Finding route…" : "Walk Here"}</span>
            {walkMeta && !walkLoading ? <span className="cq-loc-action-meta">{walkMeta}</span> : null}
          </span>
          <ChevronRight className="cq-loc-action-chevron h-4 w-4" strokeWidth={2.4} aria-hidden />
        </button>
      ) : null}

      {onAddMemory ? (
        <button
          type="button"
          className="cq-loc-action cq-loc-action--memory touch-manipulation"
          onClick={onAddMemory}
        >
          <Camera className="cq-loc-action-icon h-5 w-5" strokeWidth={2.2} aria-hidden />
          <span className="cq-loc-action-copy">
            <span className="cq-loc-action-title">Add Memory</span>
            <span className="cq-loc-action-meta">Capture the moment</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
