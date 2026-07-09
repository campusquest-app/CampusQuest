"use client";

import { memo, useMemo } from "react";
import { landmarkIconForId } from "@/lib/realm/landmarkIcons";
import type { MarkerActivityState } from "@/lib/realm/markerActivityState";
import type { RealmLocationId } from "@/lib/realm/locations";
import {
  resolveMarkerIconKind,
  resolveMarkerTone,
} from "@/lib/realm/realmMarkerVisuals";
import type { RealmMarkerVariant } from "@/lib/realm/realmMapMarkerUtils";
import type { GroupCountdown } from "@/lib/realm/eventCountdown";
import { EventCountdownBadge } from "./EventCountdownBadge";
import { MagicalMarkerGlow } from "./MagicalMarkerGlow";
import { RealmMarkerIcon } from "./RealmMarkerIcon";

function sparkleCountForMarker(
  variant: RealmMarkerVariant,
  activityState: MarkerActivityState,
  editMode: boolean,
): number {
  if (editMode || activityState === "idle" || activityState === "selected") return 0;
  if (variant === "legendary") return 5;
  if (activityState === "hot") return 4;
  if (activityState === "active") return 3;
  return 0;
}

/** Premium game-style map pin with tiered activity animations. */
export const RealmMapMarker = memo(function RealmMapMarker({
  variant,
  label,
  landmarkId,
  major = false,
  activityState = "idle",
  activityCount = 0,
  revealOpacity = 1,
  editMode = false,
  editorSelected = false,
  revealIndex,
  countdown = null,
}: {
  variant: RealmMarkerVariant;
  label: string;
  landmarkId?: RealmLocationId | string | null;
  major?: boolean;
  activityState?: MarkerActivityState;
  activityCount?: number;
  revealOpacity?: number;
  editMode?: boolean;
  editorSelected?: boolean;
  revealIndex?: number;
  /** Grouped event countdown — renders floating badge + urgency pulse. */
  countdown?: GroupCountdown | null;
}) {
  const landmarkIcon = landmarkIconForId(landmarkId);
  const tone = useMemo(() => resolveMarkerTone(variant, editMode), [variant, editMode]);
  const iconKind = useMemo(
    () => resolveMarkerIconKind(variant, landmarkIcon, editMode),
    [variant, landmarkIcon, editMode],
  );

  const hasActivity = !editMode && activityState !== "idle";
  const showCountdown = !editMode && countdown != null && countdown.state.kind !== "ended";
  const countdownUrgency = showCountdown ? countdown.state.urgency : 0;
  const countdownCancelled = showCountdown && countdown.allCancelled;
  const isLegendary = !editMode && variant === "legendary" && hasActivity;
  const isQuestPulse = !editMode && variant === "quest" && activityState === "active";
  const isEventAura = !editMode && variant === "event" && hasActivity && !isLegendary;
  const sparkleCount = sparkleCountForMarker(variant, activityState, editMode);
  const showSelectedPop = !editMode && activityState === "selected";
  const showBadge = !editMode && activityState === "hot" && activityCount >= 2;
  const showQrWiggle = !editMode && tone === "qr" && activityState !== "idle";

  return (
    <div
      className={buildMarkerClassName({
        tone,
        variant,
        major,
        activityState,
        editMode,
        editorSelected,
        revealOpacity,
        showQrWiggle,
        revealIndex,
        countdownUrgency,
        countdownCancelled,
      })}
      style={{
        opacity: revealOpacity,
        transition: "opacity 280ms ease",
        ...(revealIndex != null ? { ["--marker-enter-index" as string]: revealIndex } : {}),
      }}
      data-map-marker="true"
      data-no-drawer-swipe="true"
      data-activity-state={activityState}
      aria-label={label}
    >
      {showCountdown ? <EventCountdownBadge countdown={countdown} /> : null}
      <div className="cq-realm-marker-stack">
        <div className="cq-marker-pin-anchor">
          {!editMode ? (
            <MagicalMarkerGlow active={hasActivity} selected={showSelectedPop} />
          ) : null}
          {isLegendary ? <span className="cq-marker-legendary-runes" aria-hidden /> : null}
          {isEventAura ? <span className="cq-marker-event-aura" aria-hidden /> : null}
          {isQuestPulse ? <span className="cq-marker-quest-pulse" aria-hidden /> : null}
          {showSelectedPop ? <span className="cq-marker-selected-pop" aria-hidden /> : null}
          {sparkleCount > 0 ? (
            <span className="cq-marker-orbit" aria-hidden>
              {Array.from({ length: sparkleCount }, (_, i) => (
                <span
                  key={i}
                  className="cq-marker-sparkle-arm"
                  style={{ transform: `rotate(${(i * 360) / sparkleCount}deg)` }}
                >
                  <span
                    className="cq-marker-sparkle"
                    style={{ animationDelay: `${(i * -9) / sparkleCount}s` }}
                  />
                </span>
              ))}
            </span>
          ) : null}
          <div className="cq-realm-marker-pin">
            <RealmMarkerIcon kind={iconKind} />
          </div>
          {showBadge ? (
            <span className="cq-marker-count-badge" aria-label={`${activityCount} activities`}>
              {activityCount > 9 ? "9+" : activityCount}
            </span>
          ) : null}
        </div>
        <span className="cq-realm-marker-connector" aria-hidden />
      </div>
      <span className="cq-realm-marker-label">{label}</span>
    </div>
  );
});

function buildMarkerClassName(input: {
  tone: ReturnType<typeof resolveMarkerTone>;
  variant: RealmMarkerVariant;
  major: boolean;
  activityState: MarkerActivityState;
  editMode: boolean;
  editorSelected: boolean;
  revealOpacity: number;
  showQrWiggle: boolean;
  revealIndex?: number;
  countdownUrgency?: number;
  countdownCancelled?: boolean;
}): string {
  return [
    "cq-realm-marker",
    `cq-realm-marker--tone-${input.tone}`,
    `cq-realm-marker--state-${input.activityState}`,
    input.revealOpacity < 0.15 ? "cq-realm-marker--faded" : "",
    input.variant !== "default" && !input.editMode ? `cq-realm-marker--${input.variant}` : "",
    input.major ? "cq-realm-marker--major" : "",
    input.editMode ? "cq-realm-marker--editable" : "",
    input.editorSelected ? "cq-realm-marker--editor-selected" : "",
    input.showQrWiggle ? "cq-realm-marker--qr-wiggle" : "",
    input.revealIndex != null ? "cq-realm-marker--enter" : "",
    input.countdownUrgency ? `cq-realm-marker--urgency-${input.countdownUrgency}` : "",
    input.countdownCancelled ? "cq-realm-marker--cancelled" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
