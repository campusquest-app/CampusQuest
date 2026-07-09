import type { GroupedMapLocation } from "@/lib/mapLocationGroups";

/** Admin edit-mode pin for a single URInvolved event. */
export type UrinvolvedEditPin = {
  externalEventId: string;
  title: string;
  lat: number;
  lng: number;
  locationManuallyAdjusted: boolean;
  cancelled?: boolean;
};

/** Flatten grouped map data into draggable URInvolved event pins (admin editor). */
export function buildUrinvolvedEditPinsFromGroups(mapGroups: GroupedMapLocation[]): UrinvolvedEditPin[] {
  const byEventId = new Map<string, UrinvolvedEditPin>();

  for (const group of mapGroups) {
    if (group.lat == null || group.lng == null) continue;
    for (const event of group.events) {
      if (event.source !== "urinvolved" || !event.externalEventId) continue;
      byEventId.set(event.externalEventId, {
        externalEventId: event.externalEventId,
        title: event.title,
        lat: group.lat,
        lng: group.lng,
        locationManuallyAdjusted: Boolean(
          event.locationManuallyAdjusted ?? event.placementStatus === "manually_adjusted",
        ),
        cancelled: event.cancelled,
      });
    }
  }

  return Array.from(byEventId.values());
}
