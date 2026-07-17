"use client";

import type { CSSProperties } from "react";
import { CampusQuestMapMarker } from "./CampusQuestMapMarker";

/** Layered “You are here” beacon — CSS transform/opacity only for performance. */
export function RealmUserLocationMarker({
  position,
  accuracyMeters,
  heading,
  showLabel = true,
}: {
  position: { lat: number; lng: number };
  accuracyMeters?: number | null;
  heading?: number | null;
  showLabel?: boolean;
}) {
  return (
    <CampusQuestMapMarker position={position} zIndex={5000}>
      <span
        className="cq-gmap-user-location cq-gmap-user-location--beacon"
        aria-label="You are here"
        style={
          heading != null && Number.isFinite(heading)
            ? ({ ["--cq-user-heading" as string]: `${heading}deg` } as CSSProperties)
            : undefined
        }
      >
        {accuracyMeters != null && accuracyMeters > 0 ? (
          <span
            className="cq-gmap-user-accuracy"
            aria-hidden
            style={{
              width: `${Math.min(120, Math.max(24, accuracyMeters * 2))}px`,
              height: `${Math.min(120, Math.max(24, accuracyMeters * 2))}px`,
            }}
          />
        ) : null}
        <span className="cq-gmap-user-beacon-ring" aria-hidden />
        <span className="cq-gmap-user-dot-pulse" aria-hidden />
        <span className="cq-gmap-user-dot" />
        {heading != null && Number.isFinite(heading) ? (
          <span className="cq-gmap-user-heading" aria-hidden />
        ) : null}
        {showLabel ? <span className="cq-gmap-user-here-label">You are here</span> : null}
      </span>
    </CampusQuestMapMarker>
  );
}
