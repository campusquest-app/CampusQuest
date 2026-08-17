"use client";

import { useCallback, useState } from "react";
import type { MapEventPin, GroupedMapLocation } from "@/lib/mapLocationGroups";
import type { CampusLocationId } from "@/lib/locations/registry";
import { LocationQuestSection } from "@/components/realm/LocationQuestSection";
import { LocationActivityCard } from "./LocationActivityCard";

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
}: {
  events: MapEventPin[];
  now: Date;
  locationName: string;
  locationId: CampusLocationId | null;
  mapContent: Pick<GroupedMapLocation, "quests" | "qrCodes">;
  questReloadToken: number;
  onQuestStateChange?: (next: { count: number; loading: boolean }) => void;
  onSeeAll?: () => void;
  showAll?: boolean;
}) {
  const [questState, setQuestState] = useState({ count: 0, loading: Boolean(locationId) });
  const previewEvents = showAll ? events : events.slice(0, 4);
  const hasEvents = previewEvents.length > 0;
  const hasQuests = questState.loading || questState.count > 0;
  const handleQuestState = useCallback(
    (next: { count: number; loading: boolean }) => {
      setQuestState((current) =>
        current.count === next.count && current.loading === next.loading ? current : next,
      );
      onQuestStateChange?.(next);
    },
    [onQuestStateChange],
  );

  if (!hasEvents && !hasQuests) {
    return locationId ? (
      <LocationQuestSection
        locationId={locationId}
        mapContent={mapContent}
        reloadToken={questReloadToken}
        embedded
        onStateChange={handleQuestState}
      />
    ) : null;
  }

  return (
    <section className="cq-loc-section cq-realm-fade-in" aria-labelledby="cq-loc-happening-title">
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

      {locationId ? (
        <LocationQuestSection
          locationId={locationId}
          mapContent={mapContent}
          reloadToken={questReloadToken}
          embedded
          onStateChange={handleQuestState}
        />
      ) : null}

      {hasEvents ? (
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
