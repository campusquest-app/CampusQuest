import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { isEventCancelled } from "@/lib/realm/eventCountdown";
import { filterLiveOrUpcomingMapEvents } from "@/lib/realm/eventVisibility";

/** Map a Realm pin onto the existing EventDetailScreen feed shape. */
export function mapEventPinToFeedEvent(pin: MapEventPin): FeedEvent {
  const cancelled = isEventCancelled(pin);
  const source = pin.source?.trim() || null;
  if (source && source !== "campusquest") {
    return {
      kind: "external",
      event: {
        id: pin.externalEventId ?? pin.canonicalEventId ?? pin.id,
        source,
        title: pin.title,
        description: "",
        category: pin.category ?? "",
        location: pin.locationText ?? null,
        venueName: pin.locationText ?? null,
        address: null,
        startsAt: pin.startsAt,
        endsAt: pin.endsAt,
        organizationName: pin.organizationName,
        imageUrl: pin.imageUrl ?? null,
        eventUrl: pin.eventUrl,
        ticketUrl: pin.ticketUrl ?? null,
        broadcastUrl: pin.broadcastUrl ?? null,
        tags: cancelled ? ["cancelled"] : [],
        sport: pin.sport ?? null,
        opponent: pin.opponent ?? null,
        cqRsvpEnabled: pin.cqRsvpEnabled,
        isCancelled: cancelled,
        myRsvpStatus: null,
        imported: true,
      },
    };
  }

  return {
    kind: "campus",
    event: {
      id: pin.id,
      title: pin.title,
      description: "",
      category: pin.category ?? "Campus",
      location: pin.locationText ?? "",
      startsAt: pin.startsAt,
      endsAt: pin.endsAt,
      isPaid: false,
      hostOrganization: pin.organizationName
        ? { id: "", name: pin.organizationName, logo_url: null }
        : null,
      rsvpCount: 0,
      myRsvpStatus: null,
      isCancelled: cancelled,
      source: source ?? "campusquest",
    },
  };
}

/**
 * Supplementary event pins with exactly one live/upcoming event open that
 * event's detail. Landmarks and stacked/multi-activity pins keep the location sheet.
 */
export function singleLiveEventForMarkerTap(
  group: Pick<GroupedMapLocation, "quests" | "qrCodes" | "events">,
  now: Date = new Date(),
): MapEventPin | null {
  if (group.quests.length > 0 || group.qrCodes.length > 0) return null;
  const live = filterLiveOrUpcomingMapEvents(group.events, now);
  return live.length === 1 ? live[0] : null;
}
