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

/**
 * For You decides *which* markers render, never how they look. Majors stay as
 * orientation anchors; optional pins render only when recommended.
 */
export function isForYouMarkerVisible(args: {
  markerId: string;
  major: boolean;
  selected: boolean;
  recommendedMarkerIds: ReadonlySet<string>;
}): boolean {
  return args.selected || args.major || args.recommendedMarkerIds.has(args.markerId);
}

/**
 * Canonical marker opacity — identical on every filter so recommendation state
 * can't dim, fade, or emphasize a permanent campus pin.
 */
export function canonicalMarkerRevealOpacity(baseOpacity: number, selected: boolean): number {
  if (selected) return 1;
  return Math.max(baseOpacity, 0.92);
}
