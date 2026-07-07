"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Footprints, X } from "lucide-react";
import type { RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";
import { useSwipeDownDismiss } from "@/lib/client/useSwipeDownDismiss";
import { SWIPE_TRANSITION_MS } from "@/lib/client/mobileGestures";

export function RealmRouteSheet({
  open,
  destinationLabel,
  directionsStatus,
  onClose,
}: {
  open: boolean;
  destinationLabel: string;
  directionsStatus: RealmDirectionsStatus;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  const swipe = useSwipeDownDismiss({
    onDismiss: onClose,
    enabled: open,
    containerRef: panelRef,
  });

  useEffect(() => {
    if (open) setExpanded(true);
  }, [open]);

  if (!open) return null;

  const ready = directionsStatus.status === "ready" ? directionsStatus : null;
  const loading = directionsStatus.status === "loading";
  const error = directionsStatus.status === "error" ? directionsStatus : null;

  const originLabel =
    ready?.origin.usedFallback
      ? ready.origin.label
      : ready?.origin.hint
        ? ready.origin.label
        : "your location";

  const dragY = swipe.dragY;
  const dragging = swipe.dragging;
  const panelStyle: CSSProperties = {
    transform:
      dragY > 0
        ? `translate3d(0, ${dragY}px, 0)`
        : expanded
          ? "translate3d(0, 0, 0)"
          : "translate3d(0, calc(100% - 4.5rem), 0)",
    transition: dragging
      ? "none"
      : `transform ${SWIPE_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
  };

  return (
    <div className="cq-realm-route-sheet-wrap" role="presentation">
      <div
        ref={panelRef}
        className={`cq-realm-route-sheet${expanded ? " cq-realm-route-sheet--expanded" : ""}`}
        style={panelStyle}
        role="dialog"
        aria-modal="false"
        aria-label="Walking route"
      >
        <button
          type="button"
          className="cq-realm-route-sheet-handle"
          aria-label={expanded ? "Collapse route details" : "Expand route details"}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="cq-realm-route-sheet-grabber" aria-hidden />
        </button>

        <div className="cq-realm-route-sheet-head">
          <div className="min-w-0 flex-1">
            <p className="cq-realm-route-sheet-eyebrow">
              <Footprints className="h-3.5 w-3.5 shrink-0" aria-hidden />
              WALKING ROUTE
            </p>
            <h3 className="cq-realm-route-sheet-title">
              From {originLabel} to {destinationLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cq-realm-route-sheet-close touch-manipulation"
            aria-label="Close route"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="cq-realm-route-sheet-meta" role="status">
            Finding walking route…
          </p>
        ) : null}

        {error ? (
          <p className="cq-realm-route-sheet-meta cq-realm-route-sheet-meta--error" role="alert">
            {error.message}
          </p>
        ) : null}

        {ready ? (
          <div className="cq-realm-route-sheet-body">
            <p className="cq-realm-route-sheet-stats">
              <span>{ready.summary.durationText}</span>
              <span aria-hidden>·</span>
              <span>{ready.summary.distanceText}</span>
              {ready.summary.stepsCount != null && ready.summary.stepsCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{ready.summary.stepsCount} steps</span>
                </>
              ) : null}
            </p>
            {ready.summary.approximate ? (
              <p className="cq-realm-route-sheet-note">Approximate campus route</p>
            ) : null}
            {ready.origin.hint ? (
              <p className="cq-realm-route-sheet-note">{ready.origin.hint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
