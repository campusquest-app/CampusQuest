import type { GroupedMapLocation, MapQuestPin } from "@/lib/mapLocationGroups";
import { URI_MAP_CENTER } from "@/lib/realm/googleMapPose";

export type RealmMarkerVariant = "default" | "quest" | "legendary" | "event" | "qr" | "memories";

export function hasLegendaryQuest(quests: MapQuestPin[]): boolean {
  return quests.some((q) => q.difficulty === "legendary");
}

export function resolveLandmarkMarkerVariant(input: {
  activeQuests: number;
  upcomingEvents: number;
  activeMomentCount: number;
  mapContent: Pick<GroupedMapLocation, "quests" | "qrCodes" | "events"> | null;
}): RealmMarkerVariant {
  const quests = input.mapContent?.quests ?? [];
  if (hasLegendaryQuest(quests)) return "legendary";
  if (input.activeQuests > 0 || quests.length > 0) return "quest";
  if (input.upcomingEvents > 0 || (input.mapContent?.events.length ?? 0) > 0) return "event";
  if ((input.mapContent?.qrCodes.length ?? 0) > 0) return "qr";
  if (input.activeMomentCount > 0) return "memories";
  return "default";
}

export function resolveGroupMarkerVariant(group: GroupedMapLocation): RealmMarkerVariant {
  if (hasLegendaryQuest(group.quests)) return "legendary";
  if (group.quests.length > 0) return "quest";
  if (group.events.length > 0) return "event";
  if (group.qrCodes.length > 0) return "qr";
  return "default";
}

export function pickFeaturedQuest(
  mapContent: Pick<GroupedMapLocation, "quests"> | null,
): MapQuestPin | null {
  const quests = mapContent?.quests ?? [];
  if (quests.length === 0) return null;
  const legendary = quests.find((q) => q.difficulty === "legendary");
  return legendary ?? quests[0] ?? null;
}

export type GeoPoint = { lat: number; lng: number };

/** Order quest pins into a smooth campus loop for the dashed path overlay. */
export function orderQuestPathPoints(
  points: GeoPoint[],
  center: GeoPoint = URI_MAP_CENTER,
): GeoPoint[] {
  if (points.length <= 1) return points;
  return [...points].sort((a, b) => {
    const angleA = Math.atan2(a.lat - center.lat, a.lng - center.lng);
    const angleB = Math.atan2(b.lat - center.lat, b.lng - center.lng);
    return angleA - angleB;
  });
}
