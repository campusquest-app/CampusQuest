"use client";

import { Camera, Footprints } from "lucide-react";
import type { RealmDirectionsDestination, RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";
import { isDirectionsLoadingForDestination } from "@/lib/realm/routeUiHelpers";

export function RealmLocationActionsBar({
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
  const walkLoading = isDirectionsLoadingForDestination(directionsDestination, directionsStatus);

  return (
    <div className="cq-realm-sheet-actions" role="region" aria-label="Location actions">
      <div className="cq-realm-sheet-actions-grid">
        {directionsEnabled && directionsDestination && onRequestWalking ? (
          <button
            type="button"
            className="cq-realm-sheet-action cq-realm-sheet-action--primary touch-manipulation"
            onClick={onRequestWalking}
            aria-busy={walkLoading}
          >
            <Footprints className="h-4 w-4 shrink-0" aria-hidden />
            {walkLoading ? "Finding route…" : "Walk Here"}
          </button>
        ) : null}

        {onAddMemory ? (
          <button
            type="button"
            className="cq-realm-sheet-action touch-manipulation"
            onClick={onAddMemory}
          >
            <Camera className="h-4 w-4 shrink-0" aria-hidden />
            Add Memory
          </button>
        ) : null}
      </div>
    </div>
  );
}
