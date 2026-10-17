import type { GroupedMapLocation } from "@/lib/mapLocationGroups";

/** Admin edit-mode pin for one event that is already placed on the normal map. */
export type UrinvolvedEditPin = {
  externalEventId: string;
  title: string;
  lat: number;
  lng: number;
  locationManuallyAdjusted: boolean;
  cancelled?: boolean;
  source: string | null;
  sourceVenue: string | null;
  locationName: string;
  realmLocationId: string | null;
  /** True while a drag is held locally and not yet saved. */
  unsaved?: boolean;
};

export type EventEditDraft = { lat: number; lng: number };

/**
 * Flatten grouped map data into individually selectable event pins.
 * Uses the same group coordinates the normal map renders — every source
 * (URInvolved, athletics, and other imports), not only URInvolved.
 */
export function buildUrinvolvedEditPinsFromGroups(mapGroups: GroupedMapLocation[]): UrinvolvedEditPin[] {
  const byEventId = new Map<string, UrinvolvedEditPin>();

  for (const group of mapGroups) {
    if (group.lat == null || group.lng == null) continue;
    for (const event of group.events) {
      if (!event.externalEventId) continue;
      byEventId.set(event.externalEventId, {
        externalEventId: event.externalEventId,
        title: event.title,
        lat: group.lat,
        lng: group.lng,
        locationManuallyAdjusted: Boolean(
          event.locationManuallyAdjusted ?? event.placementStatus === "manually_adjusted",
        ),
        cancelled: event.cancelled,
        source: event.source ?? null,
        sourceVenue: event.locationText ?? null,
        locationName: group.locationName,
        realmLocationId: group.realmLocationId,
      });
    }
  }

  return Array.from(byEventId.values());
}

/** Overlay unsaved drags without mutating the pins derived from map data. */
export function applyEventEditDrafts(
  pins: UrinvolvedEditPin[],
  drafts: Readonly<Record<string, EventEditDraft>>,
): UrinvolvedEditPin[] {
  return pins.map((pin) => {
    const draft = drafts[pin.externalEventId];
    if (!draft) return pin;
    return { ...pin, lat: draft.lat, lng: draft.lng, unsaved: true };
  });
}

/** Dev/admin diagnostic — not shown in the student UI. */
export function logEventEditPinDiagnostics(pins: UrinvolvedEditPin[]): void {
  if (process.env.NODE_ENV === "production") return;
  for (const pin of pins) {
    console.info("[cq:event-edit]", {
      eventId: pin.externalEventId,
      eventTitle: pin.title,
      sourceVenue: pin.sourceVenue,
      canonicalLocationId: pin.realmLocationId,
      resolutionMethod: pin.locationManuallyAdjusted ? "manual_override" : "map_group",
      latitude: pin.lat,
      longitude: pin.lng,
      coordinateSource: pin.locationManuallyAdjusted ? "manual_override" : "resolved_group",
      source: pin.source,
    });
  }
}
