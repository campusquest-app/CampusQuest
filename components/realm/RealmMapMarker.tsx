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
import { RealmMarkerIcon } from "./RealmMarkerIcon";

const SPARKLE_COUNT: Record<MarkerActivityState, number> = {
  idle: 0,
  active: 4,
  hot: 8,
  selected: 4,
};

/** Premium game-style map pin with magical activity animations. */
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
}) {
  const landmarkIcon = landmarkIconForId(landmarkId);
  const tone = useMemo(() => resolveMarkerTone(variant, editMode), [variant, editMode]);
  const iconKind = useMemo(
    () => resolveMarkerIconKind(variant, landmarkIcon, editMode),
    [variant, landmarkIcon, editMode],
  );

  const sparkleCount = editMode ? 0 : SPARKLE_COUNT[activityState];
  const showPulseRing = !editMode && (activityState === "active" || activityState === "hot");
  const showSelectedPop = !editMode && activityState === "selected";
  const showHotAura = !editMode && activityState === "hot";
  const showBadge = !editMode && activityState === "hot" && activityCount > 0;
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
      })}
      style={{
        opacity: revealOpacity,
        transition: "opacity 280ms ease",
      }}
      data-map-marker="true"
      data-no-drawer-swipe="true"
      data-activity-state={activityState}
      aria-label={label}
    >
      <div className="cq-realm-marker-stack">
        {showHotAura ? <span className="cq-marker-hot-aura" aria-hidden /> : null}
        {showPulseRing ? <span className="cq-marker-pulse-ring" aria-hidden /> : null}
        {showSelectedPop ? <span className="cq-marker-selected-pop" aria-hidden /> : null}
        {sparkleCount > 0 ? (
          <span className="cq-marker-sparkles" aria-hidden>
            {Array.from({ length: sparkleCount }, (_, i) => (
              <span key={i} className="cq-marker-sparkle" />
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
  ]
    .filter(Boolean)
    .join(" ");
}
