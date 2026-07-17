"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Footprints, Navigation, X } from "lucide-react";
import type { RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";
import { formatRouteStatsLine } from "@/lib/realm/formatRouteSummary";
import { useSwipeDownDismiss } from "@/lib/client/useSwipeDownDismiss";
import { SWIPE_TRANSITION_MS } from "@/lib/client/mobileGestures";

function travelModeLabel(mode: string): string {
  switch (mode) {
    case "DRIVING":
      return "Driving";
    case "BICYCLING":
      return "Biking";
    case "TRANSIT":
      return "Transit";
    default:
      return "Walking";
  }
}

export function RealmRouteSheet({
  open,
  destinationLabel,
  directionsStatus,
  onClose,
  onStart,
  onRetry,
}: {
  open: boolean;
  destinationLabel: string;
  directionsStatus: RealmDirectionsStatus;
  onClose: () => void;
  onStart?: () => void;
  onRetry?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const swipe = useSwipeDownDismiss({
    onDismiss: onClose,
    enabled: open,
    containerRef: panelRef,
  });

  useEffect(() => {
    if (open) {
      setExpanded(true);
      setDirectionsOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const ready = directionsStatus.status === "ready" ? directionsStatus : null;
  const loading = directionsStatus.status === "loading";
  const error = directionsStatus.status === "error" ? directionsStatus : null;

  const originLabel = ready?.origin.usedFallback
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
          : "translate3d(0, calc(100% - 4.5rem - var(--cq-realm-nav-clearance, 0px)), 0)",
    transition: dragging
      ? "none"
      : `transform ${SWIPE_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
  };

  const statsLine = ready ? formatRouteStatsLine(ready.summary) : null;

  return (
    <div className="cq-realm-route-sheet-wrap" role="presentation">
      <div
        ref={panelRef}
        className={`cq-realm-route-sheet${expanded ? " cq-realm-route-sheet--expanded" : ""}`}
        style={panelStyle}
        role="dialog"
        aria-modal="false"
        aria-label={`${travelModeLabel(ready?.travelMode ?? "WALKING")} route`}
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
              {travelModeLabel(ready?.travelMode ?? "WALKING").toUpperCase()} ROUTE
            </p>
            <h3 className="cq-realm-route-sheet-title">
              From {originLabel} to {destinationLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cq-realm-route-sheet-close touch-manipulation"
            aria-label="Exit route"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="cq-realm-route-sheet-meta" role="status">
            Finding route…
          </p>
        ) : null}

        {error ? (
          <div className="cq-realm-route-sheet-meta cq-realm-route-sheet-meta--error" role="alert">
            <p>{error.message}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="cq-realm-route-sheet-preview touch-manipulation mt-2"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {ready ? (
          <div className="cq-realm-route-sheet-body">
            <p className="cq-realm-route-sheet-stats">{statsLine}</p>
            {ready.summary.arrivalTimeLabel ? (
              <p className="cq-realm-route-sheet-meta">
                Arrive by {ready.summary.arrivalTimeLabel}
              </p>
            ) : null}
            {ready.summary.approximate ? (
              <p className="cq-realm-route-sheet-note">Approximate campus route</p>
            ) : null}
            {ready.origin.hint ? (
              <p className="cq-realm-route-sheet-note">{ready.origin.hint}</p>
            ) : null}

            {ready.summary.steps && ready.summary.steps.length > 0 ? (
              <button
                type="button"
                className="cq-realm-route-sheet-directions-toggle touch-manipulation"
                aria-expanded={directionsOpen}
                onClick={() => setDirectionsOpen((v) => !v)}
              >
                <span>Directions</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${directionsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            ) : null}

            {directionsOpen && ready.summary.steps ? (
              <ol className="cq-realm-route-sheet-steps">
                {ready.summary.steps.map((step, index) => (
                  <li key={index} className="cq-realm-route-sheet-step">
                    <span className="cq-realm-route-sheet-step-num">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="cq-realm-route-sheet-step-text">{step.instruction}</span>
                      {step.distanceText ? (
                        <span className="cq-realm-route-sheet-step-meta">{step.distanceText}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            <div className="cq-realm-route-sheet-actions">
              {onStart ? (
                <button type="button" onClick={onStart} className="cq-realm-route-sheet-start touch-manipulation">
                  <Navigation className="h-4 w-4 shrink-0" aria-hidden />
                  Start
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="cq-realm-route-sheet-preview touch-manipulation"
              >
                Preview
              </button>
              <button type="button" onClick={onClose} className="cq-realm-route-sheet-exit touch-manipulation">
                Exit
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
