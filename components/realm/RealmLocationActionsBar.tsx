"use client";

import { Calendar, Camera, Footprints, Sparkles } from "lucide-react";
import type { RealmDirectionsDestination, RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";
import {
  locationSheetTypeLabel,
  type RealmLocationSheetType,
} from "@/lib/realm/resolveLocationSheetType";

export function RealmLocationActionsBar({
  locationName,
  sheetType,
  momentCount,
  activeQuestCount,
  eventsToday,
  directionsEnabled,
  directionsDestination,
  directionsStatus,
  onRequestWalking,
  onViewMemories,
  onStartQuest,
  onViewEvents,
}: {
  locationName: string;
  sheetType: RealmLocationSheetType;
  momentCount: number;
  activeQuestCount: number;
  eventsToday: number;
  directionsEnabled: boolean;
  directionsDestination: RealmDirectionsDestination | null;
  directionsStatus: RealmDirectionsStatus;
  onRequestWalking?: () => void;
  onViewMemories?: () => void;
  onStartQuest?: () => void;
  onViewEvents?: () => void;
}) {
  const walkReady = directionsStatus.status === "ready" ? directionsStatus : null;
  const walkLoading = directionsStatus.status === "loading";

  return (
    <div className="cq-realm-sheet-actions" role="region" aria-label="Location actions">
      <div className="cq-realm-sheet-actions-head">
        <span className={`cq-realm-sheet-type cq-realm-sheet-type--${sheetType}`}>
          {locationSheetTypeLabel(sheetType)}
        </span>
        {walkReady ? (
          <span className="cq-realm-sheet-walk-eta">
            {walkReady.summary.durationText} walk · {walkReady.summary.distanceText}
          </span>
        ) : null}
      </div>

      <div className="cq-realm-sheet-actions-stats" aria-label="Location summary">
        <span>{momentCount} memories</span>
        <span aria-hidden>·</span>
        <span>{activeQuestCount} quests</span>
        <span aria-hidden>·</span>
        <span>{eventsToday} events today</span>
      </div>

      <div className="cq-realm-sheet-actions-grid">
        {directionsEnabled && directionsDestination && onRequestWalking ? (
          <button
            type="button"
            className="cq-realm-sheet-action cq-realm-sheet-action--primary touch-manipulation"
            onClick={onRequestWalking}
            disabled={walkLoading}
          >
            <Footprints className="h-4 w-4 shrink-0" aria-hidden />
            {walkLoading ? "Finding route…" : `Walk to ${locationName}`}
          </button>
        ) : null}

        {onViewMemories ? (
          <button
            type="button"
            className="cq-realm-sheet-action touch-manipulation"
            onClick={onViewMemories}
          >
            <Camera className="h-4 w-4 shrink-0" aria-hidden />
            View memories
          </button>
        ) : null}

        {activeQuestCount > 0 && onStartQuest ? (
          <button
            type="button"
            className="cq-realm-sheet-action touch-manipulation"
            onClick={onStartQuest}
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Start quest
          </button>
        ) : null}

        {eventsToday > 0 && onViewEvents ? (
          <button
            type="button"
            className="cq-realm-sheet-action touch-manipulation"
            onClick={onViewEvents}
          >
            <Calendar className="h-4 w-4 shrink-0" aria-hidden />
            View events
          </button>
        ) : null}
      </div>
    </div>
  );
}
