"use client";

import { memo, useEffect, useMemo } from "react";
import { landmarkIconForId } from "@/lib/realm/landmarkIcons";
import type { MarkerActivityState } from "@/lib/realm/markerActivityState";
import type { MarkerPaletteColor } from "@/lib/realm/markerColorPalette";
import type { RealmLocationId } from "@/lib/realm/locations";
import { resolveMarkerIconKind } from "@/lib/realm/realmMarkerVisuals";
import type { RealmMarkerVariant } from "@/lib/realm/realmMapMarkerUtils";
import type { GroupCountdown } from "@/lib/realm/eventCountdown";
import { EventCountdownBadge } from "./EventCountdownBadge";
import { MagicalMarkerGlow } from "./MagicalMarkerGlow";
import { RealmMarkerIcon } from "./RealmMarkerIcon";

function particleCountForMarker(
  activityState: MarkerActivityState,
  editMode: boolean,
  startingSoon: boolean,
): number {
  if (editMode) return 0;
  if (activityState === "selected") return 7;
  if (startingSoon) return 6;
  if (activityState === "hot") return 5;
  if (activityState === "active") return 4;
  return 3;
}

/**
 * Debug visual mode: forces the "hurry" magic state on every event marker so
 * CSS/rendering can be verified independently of countdown/date logic.
 */
const DEBUG_MAP_MAGIC = process.env.NEXT_PUBLIC_DEBUG_MAP_MAGIC === "true";

const DEBUG_MAGIC_COUNTDOWN: GroupCountdown = {
  state: { kind: "hurry", label: "DEBUG MAGIC", urgency: 3 },
  featuredEventId: null,
  eventCount: 1,
  allCancelled: false,
};

/** Magical fantasy map pin — pointed silhouette, unique neon color, ground ring. */
export const RealmMapMarker = memo(function RealmMapMarker({
  variant,
  label,
  landmarkId,
  major = false,
  activityState = "idle",
  activityCount = 0,
  opportunityCount = 0,
  revealOpacity = 1,
  editMode = false,
  editorSelected = false,
  revealIndex,
  countdown = null,
  locationAdjusted = false,
  discoveryMode = null,
  discoveryLabel = null,
  color = "electric-blue",
  zoomTier = "near",
  deemphasized = false,
  hideLabel = false,
}: {
  variant: RealmMarkerVariant;
  label: string;
  landmarkId?: RealmLocationId | string | null;
  major?: boolean;
  activityState?: MarkerActivityState;
  /** Activity-type count (legacy hot tier). */
  activityCount?: number;
  /** Total opportunities at this location for the count badge. */
  opportunityCount?: number;
  revealOpacity?: number;
  editMode?: boolean;
  editorSelected?: boolean;
  revealIndex?: number;
  countdown?: GroupCountdown | null;
  locationAdjusted?: boolean;
  discoveryMode?: "nearest" | "spotlight" | null;
  discoveryLabel?: string | null;
  /** Distinct palette color for this visible marker. */
  color?: MarkerPaletteColor;
  /** Zoom-driven scale / label density. */
  zoomTier?: "far" | "mid" | "near";
  deemphasized?: boolean;
  hideLabel?: boolean;
}) {
  const landmarkIcon = landmarkIconForId(landmarkId);
  const iconKind = useMemo(
    () => resolveMarkerIconKind(variant, landmarkIcon, editMode),
    [variant, landmarkIcon, editMode],
  );

  const hasActivity = !editMode && activityState !== "idle";

  let effectiveCountdown = countdown;
  if (DEBUG_MAP_MAGIC && !editMode && (variant === "event" || countdown != null)) {
    effectiveCountdown = DEBUG_MAGIC_COUNTDOWN;
  }
  const showCountdown =
    !editMode && effectiveCountdown != null && effectiveCountdown.state.kind !== "ended";
  const countdownUrgency = showCountdown ? effectiveCountdown!.state.urgency : 0;
  const countdownCancelled = showCountdown && Boolean(effectiveCountdown?.allCancelled);
  const startingSoon =
    showCountdown && !countdownCancelled && (countdownUrgency >= 2 || effectiveCountdown?.state.kind === "hurry");
  const showEventMagic = showCountdown && !countdownCancelled;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" && !DEBUG_MAP_MAGIC) return;
    if (!showCountdown || !effectiveCountdown) return;
    console.info("[cq:event-marker]", {
      label,
      color,
      countdown: effectiveCountdown.state.label,
      kind: effectiveCountdown.state.kind,
      urgency: effectiveCountdown.state.urgency,
      cancelled: effectiveCountdown.allCancelled,
    });
  }, [label, color, showCountdown, effectiveCountdown]);

  const showSelectedPop = !editMode && activityState === "selected";
  const badgeCount = Math.max(opportunityCount, activityCount);
  const showBadge = !editMode && badgeCount > 1;
  const showDiscovery = !editMode && discoveryMode != null;
  const showDiscoveryLabel = showDiscovery && Boolean(discoveryLabel);
  const showNameLabel =
    activityState === "selected" ||
    Boolean(showCountdown) ||
    activityState === "hot" ||
    (!hideLabel && !deemphasized && zoomTier !== "far");
  const particles = deemphasized ? 0 : particleCountForMarker(activityState, editMode, startingSoon);

  return (
    <div
      className={buildMarkerClassName({
        color,
        variant,
        major,
        activityState,
        editMode,
        editorSelected,
        revealOpacity,
        revealIndex,
        countdownUrgency,
        countdownCancelled,
        discoveryMode,
        startingSoon,
        deemphasized,
      })}
      style={{
        opacity: revealOpacity,
        transition: "opacity 280ms ease",
        ...(revealIndex != null ? { ["--marker-enter-index" as string]: revealIndex } : {}),
      }}
      data-map-marker="true"
      data-no-drawer-swipe="true"
      data-color={color}
      data-activity-state={activityState}
      data-zoom-tier={zoomTier}
      aria-label={label}
    >
      {showDiscoveryLabel ? (
        <span
          className={`cq-realm-discovery-label${
            discoveryMode === "spotlight" ? " cq-realm-discovery-label--spotlight" : ""
          }`}
        >
          {discoveryLabel}
        </span>
      ) : null}
      {showCountdown && effectiveCountdown ? (
        <EventCountdownBadge countdown={effectiveCountdown} />
      ) : null}
      {locationAdjusted ? (
        <span className="cq-realm-marker-adjusted" title="Admin adjusted location">
          Adjusted
        </span>
      ) : null}

      <div className="marker-stack">
        <div className="marker-pin-anchor">
          {!editMode && !deemphasized ? (
            <MagicalMarkerGlow
              active={hasActivity || showEventMagic || showDiscovery || activityState === "idle"}
              selected={showSelectedPop}
              particleCount={particles}
            />
          ) : null}

          {showDiscovery ? (
            <span
              className={`cq-realm-discovery-ring${
                discoveryMode === "spotlight" ? " cq-realm-discovery-ring--spotlight" : ""
              }`}
              aria-hidden
            />
          ) : null}

          {showEventMagic ? (
            <span className="cq-event-magic" aria-hidden>
              <span className="cq-event-magic-ring" />
              <span className="cq-event-magic-ring cq-event-magic-ring--second" />
            </span>
          ) : null}

          {showSelectedPop ? <span className="marker-selected-pop" aria-hidden /> : null}

          <div className="marker-pin">
            <div className="marker-icon">
              <RealmMarkerIcon kind={iconKind} />
            </div>
            {showBadge ? (
              <span className="marker-count" aria-label={`${badgeCount} opportunities`}>
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            ) : null}
          </div>

          <span className="marker-ground-ring" aria-hidden />
        </div>
      </div>

      {showNameLabel ? <span className="marker-label">{label}</span> : null}
    </div>
  );
});

function buildMarkerClassName(input: {
  color: MarkerPaletteColor;
  variant: RealmMarkerVariant;
  major: boolean;
  activityState: MarkerActivityState;
  editMode: boolean;
  editorSelected: boolean;
  revealOpacity: number;
  revealIndex?: number;
  countdownUrgency?: number;
  countdownCancelled?: boolean;
  discoveryMode?: "nearest" | "spotlight" | null;
  startingSoon?: boolean;
  deemphasized?: boolean;
}): string {
  return [
    "realm-marker",
    "cq-realm-marker",
    `realm-marker--${input.color}`,
    `cq-realm-marker--state-${input.activityState}`,
    input.revealOpacity < 0.15 ? "cq-realm-marker--faded" : "",
    input.variant !== "default" && !input.editMode ? `cq-realm-marker--${input.variant}` : "",
    input.major ? "cq-realm-marker--major" : "",
    input.editMode ? "cq-realm-marker--editable" : "",
    input.editorSelected ? "cq-realm-marker--editor-selected" : "",
    input.revealIndex != null ? "cq-realm-marker--enter" : "",
    input.countdownUrgency ? `cq-realm-marker--urgency-${input.countdownUrgency}` : "",
    input.countdownCancelled ? "cq-realm-marker--cancelled" : "",
    input.startingSoon ? "realm-marker--starting-soon" : "",
    input.discoveryMode === "nearest" ? "cq-realm-marker--discovery-nearest" : "",
    input.discoveryMode === "spotlight" ? "cq-realm-marker--discovery-spotlight" : "",
    input.deemphasized ? "cq-realm-marker--deemphasized" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
