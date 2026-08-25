import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount } from "@/lib/mapLocationGroups";
import { getGroupCountdown } from "@/lib/realm/eventCountdown";

/** Public map pills plus internal editor/legacy filters. */
export type MapMarkerFilter = "for_you" | "live" | "events" | "places" | "all" | "quests" | "memories" | "qr";

export const MAP_FILTER_PILLS: { id: MapMarkerFilter; label: string; liveDot?: boolean }[] = [
  { id: "for_you", label: "For You" },
  { id: "live", label: "Live Now", liveDot: true },
  { id: "events", label: "Events" },
  { id: "places", label: "Places" },
];

export type MapFilterLandmark = {
  id: string;
  major: boolean;
  upcomingEvents: number;
  activeMomentCount: number;
  mapContent: GroupedMapLocation | null;
};

export function groupHasLiveEvent(events: MapEventPin[] | undefined, now: Date): boolean {
  if (!events?.length) return false;
  const countdown = getGroupCountdown(events, now);
  return countdown?.state.kind === "live";
}

export function landmarkMatchesFilter(
  landmark: MapFilterLandmark,
  filter: MapMarkerFilter,
  now: Date,
  recommendedMarkerIds?: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case "for_you":
      if (landmark.major) return true;
      return Boolean(recommendedMarkerIds?.has(landmark.id));
    case "places":
      return true;
    case "all":
      return true;
    case "live":
      return groupHasLiveEvent(landmark.mapContent?.events, now);
    case "quests":
      return (landmark.mapContent?.quests.length ?? 0) > 0;
    case "events":
      return landmark.upcomingEvents > 0 || (landmark.mapContent?.events.length ?? 0) > 0;
    case "memories":
      return landmark.activeMomentCount > 0;
    case "qr":
      return (landmark.mapContent?.qrCodes.length ?? 0) > 0;
  }
}

export function groupMatchesFilter(
  group: GroupedMapLocation,
  filter: MapMarkerFilter,
  now: Date,
  recommendedMarkerIds?: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case "for_you":
      return Boolean(recommendedMarkerIds?.has(group.groupKey));
    case "places":
      return false;
    case "all":
      return true;
    case "live":
      return groupHasLiveEvent(group.events, now);
    case "quests":
      return group.quests.length > 0;
    case "events":
      return group.events.length > 0;
    case "memories":
      return false;
    case "qr":
      return group.qrCodes.length > 0;
  }
}

export function groupVisibleOnMap(group: GroupedMapLocation, filter: MapMarkerFilter, now: Date, recommendedMarkerIds?: ReadonlySet<string>): boolean {
  if (mapLocationActivityCount(group) <= 0 && filter !== "places") {
    if (filter !== "for_you") return false;
  }
  return groupMatchesFilter(group, filter, now, recommendedMarkerIds);
}

export type ForYouMarkerEmphasis = "selected" | "recommended" | "context" | "hidden";

export function resolveForYouMarkerEmphasis(args: {
  markerId: string;
  major: boolean;
  selected: boolean;
  recommendedMarkerIds: ReadonlySet<string>;
}): ForYouMarkerEmphasis {
  if (args.selected) return "selected";
  if (args.recommendedMarkerIds.has(args.markerId)) return "recommended";
  if (args.major) return "context";
  return "hidden";
}

export function forYouRevealOpacity(emphasis: ForYouMarkerEmphasis, baseOpacity: number): number {
  if (emphasis === "selected") return 1;
  if (emphasis === "recommended") return Math.max(baseOpacity, 0.92);
  if (emphasis === "context") return Math.min(baseOpacity, 0.42);
  return 0;
}
