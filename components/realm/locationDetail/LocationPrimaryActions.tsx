"use client";

import { Camera } from "lucide-react";

/** Location-sheet actions. Routing controls are not shown on this surface. */
export function LocationPrimaryActions({
  onAddMemory,
}: {
  directionsEnabled?: boolean;
  directionsDestination?: unknown;
  directionsStatus?: unknown;
  onRequestWalking?: () => void;
  onAddMemory?: () => void;
}) {
  if (!onAddMemory) return null;

  return (
    <div className="cq-loc-actions" role="region" aria-label="Location actions">
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
    </div>
  );
}
