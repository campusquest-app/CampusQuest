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
import { FEATURE_FLAGS } from "@/lib/featureFlags";

function initialQuestState(locationId: CampusLocationId | null): LocationQuestSectionState {
  return {
    count: 0,
    initialLoading: Boolean(locationId),
    loaded: !locationId,
  };
}

export function LocationActivitySection({
  events,
  historyEvents = [],
  now,
  locationName,
  locationId,
  mapContent,
  questReloadToken,
  onQuestStateChange,
  onSeeAll,
  onOpenEvent,
  showAll = false,
  eventsLoaded = true,
}: {
  events: MapEventPin[];
  historyEvents?: MapEventPin[];
  now: Date;
  locationName: string;
  locationId: CampusLocationId | null;
  mapContent: Pick<GroupedMapLocation, "quests" | "qrCodes">;
  questReloadToken: number;
  onQuestStateChange?: (next: LocationQuestSectionState) => void;
  onSeeAll?: () => void;
  onOpenEvent?: (event: MapEventPin) => void;
  showAll?: boolean;
  eventsLoaded?: boolean;
}) {
  const showQuests = FEATURE_FLAGS.progression;
  const [questState, setQuestState] = useState(() =>
    showQuests ? initialQuestState(locationId) : { count: 0, initialLoading: false, loaded: true },
  );

  useEffect(() => {
    setQuestState(showQuests ? initialQuestState(locationId) : { count: 0, initialLoading: false, loaded: true });
  }, [locationId, showQuests]);

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

  const previewUpcoming = showAll ? events : events.slice(0, 4);
  const previewHistory = showAll ? historyEvents : historyEvents.slice(0, 3);
  const eventCount = events.length + historyEvents.length;
  const mapHasQuestPins =
    (mapContent.quests?.length ?? 0) + (mapContent.qrCodes?.length ?? 0) > 0;
  const visibility = shouldShowLocationActivitySection({
    eventCount,
    questCount: questState.count,
    eventsLoaded,
    questsLoaded: questState.loaded,
    mapHasQuestPins,
  });
  const showSeeAll = Boolean(onSeeAll) && !showAll && (events.length > 4 || historyEvents.length > 3);

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
          {showSeeAll ? (
            <button type="button" className="cq-loc-section-link" onClick={onSeeAll}>
              See all
            </button>
          ) : null}
        </div>
      ) : null}

      {showQuests && locationId ? (
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

      {visibility.showSection && previewUpcoming.length > 0 ? (
        <ul className="cq-loc-activity-list">
          {previewUpcoming.map((event) => (
            <li key={event.id}>
              <LocationActivityCard
                event={event}
                now={now}
                locationName={locationName}
                onOpen={onOpenEvent}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {visibility.showSection && previewHistory.length > 0 ? (
        <>
          <h4 className="cq-loc-subsection-title">Past & cancelled</h4>
          <ul className="cq-loc-activity-list">
            {previewHistory.map((event) => (
              <li key={event.id}>
                <LocationActivityCard
                  event={event}
                  now={now}
                  locationName={locationName}
                  onOpen={onOpenEvent}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
