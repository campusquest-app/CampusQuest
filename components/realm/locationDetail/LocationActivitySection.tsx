"use client";

import { useCallback, useEffect, useState } from "react";
import type { MapEventPin, GroupedMapLocation } from "@/lib/mapLocationGroups";
import type { CampusLocationId } from "@/lib/locations/registry";
import {
  LocationQuestSection,
  type LocationQuestSectionState,
} from "@/components/realm/LocationQuestSection";
import { LocationActivityCard } from "./LocationActivityCard";
import { shouldShowLocationActivitySection } from "@/lib/realm/locationActivityVisibility";

function initialQuestState(locationId: CampusLocationId | null): LocationQuestSectionState {
  return {
    count: 0,
    initialLoading: Boolean(locationId),
    loaded: !locationId,
  };
}

export function LocationActivitySection({
  events,
  now,
  locationName,
  locationId,
  mapContent,
  questReloadToken,
  onQuestStateChange,
  onSeeAll,
  showAll = false,
  eventsLoaded = true,
}: {
  events: MapEventPin[];
  now: Date;
  locationName: string;
  locationId: CampusLocationId | null;
  mapContent: Pick<GroupedMapLocation, "quests" | "qrCodes">;
  questReloadToken: number;
  onQuestStateChange?: (next: LocationQuestSectionState) => void;
  onSeeAll?: () => void;
  showAll?: boolean;
  eventsLoaded?: boolean;
}) {
  const [questState, setQuestState] = useState(() => initialQuestState(locationId));

  useEffect(() => {
    setQuestState(initialQuestState(locationId));
  }, [locationId]);

  const handleQuestState = useCallback(
    (next: LocationQuestSectionState) => {
      setQuestState((current) =>
        current.count === next.count &&
        current.initialLoading === next.initialLoading &&
        current.loaded === next.loaded
          ? current
          : next,
      );
      onQuestStateChange?.(next);
    },
    [onQuestStateChange],
  );

  const previewEvents = showAll ? events : events.slice(0, 4);
  const mapHasQuestPins =
    (mapContent.quests?.length ?? 0) + (mapContent.qrCodes?.length ?? 0) > 0;
  const visibility = shouldShowLocationActivitySection({
    eventCount: previewEvents.length,
    questCount: questState.count,
    eventsLoaded,
    questsLoaded: questState.loaded,
    mapHasQuestPins,
  });

  // Keep LocationQuestSection mounted in one stable tree position so loading
  // state never remount-loops when the section hides after an empty result.
  // CSS `.cq-loc-section[hidden] { display:none !important }` is required —
  // `display:flex` on `.cq-loc-section` otherwise overrides the HTML hidden attr.
  return (
    <section
      className="cq-loc-section"
      aria-labelledby={visibility.showSection ? "cq-loc-happening-title" : undefined}
      hidden={!visibility.showSection}
      aria-hidden={!visibility.showSection}
    >
      {visibility.showSection ? (
        <div className="cq-loc-section-head">
          <h3 id="cq-loc-happening-title" className="cq-loc-section-title">
            What&apos;s Happening
          </h3>
          {onSeeAll && !showAll && events.length > 4 ? (
            <button type="button" className="cq-loc-section-link" onClick={onSeeAll}>
              See all
            </button>
          ) : null}
        </div>
      ) : null}

      {locationId ? (
        <LocationQuestSection
          key={locationId}
          locationId={locationId}
          mapContent={mapContent}
          reloadToken={questReloadToken}
          embedded
          showSkeleton={visibility.showQuestSkeleton}
          onStateChange={handleQuestState}
        />
      ) : null}

      {visibility.showSection && previewEvents.length > 0 ? (
        <ul className="cq-loc-activity-list">
          {previewEvents.map((event) => (
            <li key={event.id}>
              <LocationActivityCard event={event} now={now} locationName={locationName} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
