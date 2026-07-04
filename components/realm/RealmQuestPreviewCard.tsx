"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { MapControl, ControlPosition } from "@vis.gl/react-google-maps";
import type { MapQuestPin } from "@/lib/mapLocationGroups";

export function RealmQuestPreviewCard({
  quest,
  locationName,
  realmMode,
  onOpen,
}: {
  quest: MapQuestPin | null;
  locationName: string;
  realmMode: boolean;
  onOpen?: () => void;
}) {
  if (!realmMode || !quest) return null;

  const legendary = quest.difficulty === "legendary";

  return (
    <MapControl position={ControlPosition.BOTTOM_CENTER}>
      <button
        type="button"
        onClick={onOpen}
        className={`realm-quest-preview-card mb-4 touch-manipulation${legendary ? " realm-quest-preview-card--legendary" : ""}`}
        aria-label={`Quest at ${locationName}: ${quest.name}`}
      >
        <span className="realm-quest-preview-card-accent" aria-hidden />
        <span className="realm-quest-preview-card-body">
          <span className="realm-quest-preview-card-kicker">
            <Sparkles className="h-3 w-3" strokeWidth={2.2} aria-hidden />
            {legendary ? "Legendary quest" : "Active quest"}
          </span>
          <span className="realm-quest-preview-card-title">{quest.name}</span>
          <span className="realm-quest-preview-card-meta">
            {locationName}
            {quest.xpReward > 0 ? ` · ${quest.xpReward} XP` : ""}
          </span>
        </span>
        <ChevronRight className="realm-quest-preview-card-chevron h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
      </button>
    </MapControl>
  );
}
