"use client";

import { EventDetailScreen } from "@/components/events/EventDetailScreen";
import type { ExternalFeedEventItem } from "@/lib/client/eventFeedTypes";

export type ExternalEventDetailData = {
  id: string;
  source?: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizationName: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  tags: string[];
  latitude?: number | null;
  longitude?: number | null;
};

export function ExternalEventDetailScreen({
  event,
  onBack,
  onViewOnMap,
  onWalkHere,
}: {
  event: ExternalEventDetailData;
  onBack: () => void;
  backLabel?: string;
  onViewOnMap?: () => void;
  onWalkHere?: () => void;
}) {
  const feedEvent: ExternalFeedEventItem = {
    ...event,
    source: event.source ?? "urinvolved",
    myRsvpStatus: null,
    imported: true,
  };

  return (
    <EventDetailScreen
      item={{ kind: "external", event: feedEvent }}
      onBack={onBack}
      onViewOnMap={onViewOnMap}
      onWalkHere={onWalkHere}
    />
  );
}
